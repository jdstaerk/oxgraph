use super::super::ast_utils::{
    binding_identifier, direct_identifier_callee, module_export_name, module_export_symbol,
    symbol_id_for_reference,
};
use super::super::internal_model::{ExportTarget, ImportBinding};
use super::super::model::{CallGraphIssueKind, CallNodeKind};
use super::FileCallAnalyzer;
use crate::module_resolver::resolve_module_path;
use crate::path_utils::{InternalAliasPattern, is_project_source_file};
use oxc_ast::AstKind;
use oxc_ast::ast::{
    Declaration, ExportAllDeclaration, ExportDefaultDeclaration, ExportDefaultDeclarationKind,
    ExportNamedDeclaration, Expression, ImportDeclaration, ImportDeclarationSpecifier,
    ImportOrExportKind, ModuleExportName,
};
use std::path::PathBuf;

impl<'a> FileCallAnalyzer<'a> {
    pub(super) fn collect_imports(&mut self) {
        for node in self.semantic.nodes().iter() {
            let AstKind::ImportDeclaration(declaration) = node.kind() else {
                continue;
            };
            self.collect_import_declaration(declaration);
        }
    }

    pub(super) fn collect_exports(&mut self) {
        for node in self.semantic.nodes().iter() {
            match node.kind() {
                AstKind::ExportNamedDeclaration(declaration) => {
                    self.collect_export_named_declaration(declaration);
                }
                AstKind::ExportAllDeclaration(declaration) => {
                    self.collect_export_all_declaration(declaration);
                }
                AstKind::ExportDefaultDeclaration(declaration) => {
                    self.collect_export_default_declaration(declaration);
                }
                _ => {}
            }
        }
    }

    fn collect_import_declaration(&mut self, declaration: &ImportDeclaration<'a>) {
        if declaration.import_kind == ImportOrExportKind::Type {
            return;
        }

        let source = declaration.source.value.as_str();
        let Some(source_path) = self.resolve_dependency(source) else {
            return;
        };

        let Some(specifiers) = &declaration.specifiers else {
            return;
        };

        for specifier in specifiers {
            match specifier {
                ImportDeclarationSpecifier::ImportSpecifier(specifier) => {
                    if specifier.import_kind == ImportOrExportKind::Type {
                        continue;
                    }
                    if let Some(symbol_id) = specifier.local.symbol_id.get()
                        && let Some(export_name) = module_export_name(&specifier.imported)
                    {
                        self.imports_by_symbol.insert(
                            symbol_id.index(),
                            ImportBinding {
                                source_path: source_path.clone(),
                                export_name,
                            },
                        );
                    }
                }
                ImportDeclarationSpecifier::ImportDefaultSpecifier(specifier) => {
                    if let Some(symbol_id) = specifier.local.symbol_id.get() {
                        self.imports_by_symbol.insert(
                            symbol_id.index(),
                            ImportBinding {
                                source_path: source_path.clone(),
                                export_name: "default".to_string(),
                            },
                        );
                    }
                }
                ImportDeclarationSpecifier::ImportNamespaceSpecifier(specifier) => {
                    if let Some(symbol_id) = specifier.local.symbol_id.get() {
                        self.namespace_imports_by_symbol
                            .insert(symbol_id.index(), source_path.clone());
                    }
                }
            }
        }
    }

    fn collect_export_named_declaration(&mut self, declaration: &ExportNamedDeclaration<'a>) {
        if declaration.export_kind == ImportOrExportKind::Type {
            return;
        }

        if let Some(source) = &declaration.source {
            let source = source.value.as_str();
            let Some(source_path) = self.resolve_dependency(source) else {
                return;
            };

            for specifier in &declaration.specifiers {
                if specifier.export_kind == ImportOrExportKind::Type {
                    continue;
                }
                if let (Some(local_name), Some(exported_name)) = (
                    module_export_name(&specifier.local),
                    module_export_name(&specifier.exported),
                ) {
                    self.analysis.exports.insert(
                        exported_name,
                        ExportTarget::ReExport {
                            source_path: source_path.clone(),
                            export_name: local_name,
                        },
                    );
                }
            }
            return;
        }

        if let Some(declaration) = &declaration.declaration {
            self.collect_exported_declaration(declaration);
        }

        for specifier in &declaration.specifiers {
            if specifier.export_kind == ImportOrExportKind::Type {
                continue;
            }
            let Some(exported_name) = module_export_name(&specifier.exported) else {
                continue;
            };

            if let Some(target_id) = self.export_specifier_target(&specifier.local) {
                self.analysis
                    .exports
                    .insert(exported_name, ExportTarget::LocalNode(target_id));
            }
        }
    }

    fn collect_export_all_declaration(&mut self, declaration: &ExportAllDeclaration<'a>) {
        if declaration.export_kind == ImportOrExportKind::Type {
            return;
        }
        let source = declaration.source.value.as_str();
        let Some(source_path) = self.resolve_dependency(source) else {
            return;
        };

        if declaration.exported.is_none() {
            self.analysis.star_re_exports.push(source_path);
        }
    }

    fn collect_export_default_declaration(&mut self, declaration: &ExportDefaultDeclaration<'a>) {
        if let Some(target_id) = self.default_export_target(declaration) {
            self.analysis
                .exports
                .insert("default".to_string(), ExportTarget::LocalNode(target_id));
        }
    }

    fn collect_exported_declaration(&mut self, declaration: &Declaration<'a>) {
        match declaration {
            Declaration::FunctionDeclaration(function) => {
                if let Some(identifier) = &function.id {
                    let name = identifier.name.as_str();
                    if let Some(target_id) = self.local_function_by_name(name) {
                        self.analysis
                            .exports
                            .insert(name.to_string(), ExportTarget::LocalNode(target_id));
                    }
                }
            }
            Declaration::VariableDeclaration(declaration) => {
                for declarator in &declaration.declarations {
                    if let Some(identifier) = binding_identifier(&declarator.id) {
                        let name = identifier.name.as_str();
                        if let Some(target_id) = self.local_function_by_name(name) {
                            self.analysis
                                .exports
                                .insert(name.to_string(), ExportTarget::LocalNode(target_id));
                        }
                    }
                }
            }
            _ => {}
        }
    }

    fn default_export_target(
        &mut self,
        declaration: &ExportDefaultDeclaration<'a>,
    ) -> Option<String> {
        match &declaration.declaration {
            ExportDefaultDeclarationKind::FunctionDeclaration(function) => {
                let name = function
                    .id
                    .as_ref()
                    .map(|identifier| identifier.name.as_str())
                    .unwrap_or("default");
                let target_id = self.insert_function_node(
                    function.node_id.get().index(),
                    name,
                    CallNodeKind::Function,
                    function.span,
                );

                if let Some(identifier) = &function.id
                    && let Some(symbol_id) = identifier.symbol_id.get()
                {
                    self.symbol_to_call_node
                        .insert(symbol_id.index(), target_id.clone());
                }

                Some(target_id)
            }
            _ => declaration
                .declaration
                .as_expression()
                .and_then(|expression| self.default_export_expression_target(expression)),
        }
    }

    fn default_export_expression_target(&mut self, expression: &Expression<'a>) -> Option<String> {
        match expression {
            Expression::ArrowFunctionExpression(function) => Some(self.insert_function_node(
                function.node_id.get().index(),
                "default",
                CallNodeKind::ArrowFunction,
                function.span,
            )),
            Expression::FunctionExpression(function) => Some(
                self.insert_function_node(
                    function.node_id.get().index(),
                    function
                        .id
                        .as_ref()
                        .map(|identifier| identifier.name.as_str())
                        .unwrap_or("default"),
                    CallNodeKind::Function,
                    function.span,
                ),
            ),
            _ => direct_identifier_callee(expression)
                .and_then(|identifier| symbol_id_for_reference(self.semantic.scoping(), identifier))
                .and_then(|symbol_id| self.symbol_to_call_node.get(&symbol_id).cloned()),
        }
    }

    fn export_specifier_target(&self, local: &ModuleExportName<'a>) -> Option<String> {
        if let Some(symbol_id) = module_export_symbol(self.semantic.scoping(), local)
            && let Some(target_id) = self.symbol_to_call_node.get(&symbol_id)
        {
            return Some(target_id.clone());
        }

        module_export_name(local).and_then(|name| self.local_function_by_name(&name))
    }

    fn resolve_dependency(&mut self, specifier: &str) -> Option<PathBuf> {
        match resolve_module_path(self.resolver, self.file_path, specifier) {
            Ok(path) => {
                if !is_project_source_file(&path, self.project_root) {
                    return None;
                }

                if self.dependency_index.insert(path.clone()) {
                    self.analysis.dependencies.push(path.clone());
                }
                Some(path)
            }
            Err(message) => {
                if should_report_unresolved_dependency(specifier, self.internal_aliases) {
                    self.push_issue(
                        CallGraphIssueKind::ResolveError,
                        format!("{} -> {}", specifier, message),
                    );
                }
                None
            }
        }
    }
}

fn should_report_unresolved_dependency(
    specifier: &str,
    internal_aliases: &[InternalAliasPattern],
) -> bool {
    specifier.starts_with("./")
        || specifier.starts_with("../")
        || internal_aliases
            .iter()
            .any(|alias| alias.matches(specifier))
}
