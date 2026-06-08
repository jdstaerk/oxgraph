use crate::module_resolver::{create_module_resolver, resolve_module_path};
use crate::path_utils::{
    EntryPathError, normalize_existing_path, resolve_entry_path, stable_path_string,
};
use oxc_allocator::Allocator;
use oxc_ast::AstKind;
use oxc_ast::ast::{
    BindingPattern, CallExpression, Declaration, ExportAllDeclaration, ExportDefaultDeclaration,
    ExportDefaultDeclarationKind, ExportNamedDeclaration, Expression, Function, FunctionType,
    IdentifierReference, ImportDeclaration, ImportDeclarationSpecifier, ImportOrExportKind,
    MethodDefinition, ModuleExportName, PropertyKey, VariableDeclarator,
};
use oxc_parser::Parser;
use oxc_resolver::Resolver;
use oxc_semantic::{AstNodes, NodeId, Scoping, Semantic, SemanticBuilder};
use oxc_span::{SourceType, Span};
use serde::Serialize;
use std::collections::{HashMap, HashSet, VecDeque};
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CallGraph {
    pub nodes: Vec<CallNode>,
    pub edges: Vec<CallEdge>,
    pub issues: Vec<CallGraphIssue>,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CallNodeKind {
    Function,
    Method,
    ArrowFunction,
    Unresolved,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CallNodeStatus {
    Resolved,
    Unresolved,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CallNode {
    pub id: String,
    pub label: String,
    pub name: String,
    pub file: String,
    pub kind: CallNodeKind,
    pub status: CallNodeStatus,
    pub span_start: u32,
    pub span_end: u32,
    pub is_entry: bool,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CallEdgeKind {
    Direct,
    Import,
    Method,
    Unresolved,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CallConfidence {
    High,
    Medium,
    Low,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CallEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub callee_name: String,
    pub kind: CallEdgeKind,
    pub confidence: CallConfidence,
    pub unresolved: bool,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CallGraphIssueKind {
    ReadError,
    ParseError,
    ResolveError,
    SemanticError,
    EntryFunctionNotFound,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CallGraphIssue {
    pub id: String,
    pub file: String,
    pub kind: CallGraphIssueKind,
    pub message: String,
}

#[derive(Debug)]
pub enum CallGraphBuildError {
    EntryNotFound { path: PathBuf },
    EntryReadFailed { path: PathBuf, message: String },
}

impl fmt::Display for CallGraphBuildError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EntryNotFound { path } => {
                write!(f, "entry file does not exist: {}", path.display())
            }
            Self::EntryReadFailed { path, message } => {
                write!(
                    f,
                    "failed to read entry file {}: {}",
                    path.display(),
                    message
                )
            }
        }
    }
}

impl std::error::Error for CallGraphBuildError {}

impl From<EntryPathError> for CallGraphBuildError {
    fn from(error: EntryPathError) -> Self {
        match error {
            EntryPathError::NotFound { path } => Self::EntryNotFound { path },
            EntryPathError::ReadFailed { path, message } => Self::EntryReadFailed { path, message },
        }
    }
}

pub fn build_call_graph(
    entry_file: impl AsRef<Path>,
    entry_function: Option<&str>,
) -> Result<CallGraph, CallGraphBuildError> {
    let entry_path = resolve_entry_path(entry_file.as_ref())?;
    let project_root = find_project_root(&entry_path);
    let resolver = create_module_resolver(&entry_path);
    let mut builder = ProjectCallGraphBuilder::new(entry_path, project_root, resolver);

    builder.analyze_reachable_files();
    Ok(builder.finish(entry_function))
}

struct ProjectCallGraphBuilder {
    entry_path: PathBuf,
    project_root: PathBuf,
    resolver: Resolver,
    analyses: HashMap<PathBuf, FileAnalysis>,
    issue_counter: usize,
}

impl ProjectCallGraphBuilder {
    fn new(entry_path: PathBuf, project_root: PathBuf, resolver: Resolver) -> Self {
        Self {
            entry_path,
            project_root,
            resolver,
            analyses: HashMap::new(),
            issue_counter: 0,
        }
    }

    fn analyze_reachable_files(&mut self) {
        let mut queue = VecDeque::from([self.entry_path.clone()]);
        let mut queued = HashSet::new();

        while let Some(file_path) = queue.pop_front() {
            let normalized = normalize_existing_path(&file_path).unwrap_or(file_path);
            if self.analyses.contains_key(&normalized) || !queued.insert(normalized.clone()) {
                continue;
            }

            if !is_supported_source_file(&normalized) {
                continue;
            }

            let analysis = analyze_file(&normalized, &self.resolver);
            for dependency in &analysis.dependencies {
                if self.should_analyze_dependency(dependency) {
                    queue.push_back(dependency.clone());
                }
            }
            self.analyses.insert(normalized, analysis);
        }
    }

    fn should_analyze_dependency(&self, dependency: &Path) -> bool {
        is_supported_source_file(dependency)
            && !path_contains_segment(dependency, "node_modules")
            && dependency.starts_with(&self.project_root)
    }

    fn finish(mut self, entry_function: Option<&str>) -> CallGraph {
        let mut graph = CallGraph::default();
        let mut node_index = HashSet::new();
        let mut edge_index = HashSet::new();

        let issues: Vec<AnalysisIssue> = self
            .analyses
            .values()
            .flat_map(|analysis| analysis.issues.iter().cloned())
            .collect();
        for issue in issues {
            self.push_issue(&mut graph, issue.file, issue.kind, issue.message);
        }

        for analysis in self.analyses.values() {
            for node in &analysis.nodes {
                if node_index.insert(node.id.clone()) {
                    graph.nodes.push(node.clone());
                }
            }
        }

        for analysis in self.analyses.values() {
            for edge in &analysis.pending_edges {
                let target_id = match &edge.target {
                    PendingCallTarget::Node(id) => Some(id.clone()),
                    PendingCallTarget::Export {
                        source_path,
                        export_name,
                    } => self.resolve_export(source_path, export_name, &mut HashSet::new()),
                };

                if let Some(target_id) = target_id {
                    push_edge(
                        &mut graph,
                        &mut edge_index,
                        EdgeInsert {
                            source: edge.source.clone(),
                            target: target_id,
                            callee_name: edge.callee_name.clone(),
                            kind: edge.kind.clone(),
                            confidence: edge.confidence.clone(),
                            unresolved: false,
                        },
                    );
                }
            }
        }

        if let Some(entry_function) = normalize_entry_function(entry_function) {
            filter_to_entry_neighborhood(&mut graph, entry_function, &mut self.issue_counter);
        }

        graph
    }

    fn resolve_export(
        &self,
        file_path: &Path,
        export_name: &str,
        resolution_stack: &mut HashSet<(PathBuf, String)>,
    ) -> Option<String> {
        let normalized =
            normalize_existing_path(file_path).unwrap_or_else(|_| file_path.to_path_buf());
        let key = (normalized.clone(), export_name.to_string());
        if !resolution_stack.insert(key.clone()) {
            return None;
        }

        let analysis = self.analyses.get(&normalized)?;

        if let Some(target) = analysis.exports.get(export_name) {
            let resolved = match target {
                ExportTarget::LocalNode(id) => Some(id.clone()),
                ExportTarget::ReExport {
                    source_path,
                    export_name,
                } => self.resolve_export(source_path, export_name, resolution_stack),
            };
            resolution_stack.remove(&key);
            return resolved;
        }

        if export_name == "default" {
            resolution_stack.remove(&key);
            return None;
        }

        let mut resolved_target = None;
        for source_path in &analysis.star_re_exports {
            if let Some(target_id) = self.resolve_export(source_path, export_name, resolution_stack)
            {
                if resolved_target
                    .as_ref()
                    .is_some_and(|existing| existing != &target_id)
                {
                    resolution_stack.remove(&key);
                    return None;
                }
                resolved_target = Some(target_id);
            }
        }

        resolution_stack.remove(&key);
        resolved_target
    }

    fn push_issue(
        &mut self,
        graph: &mut CallGraph,
        file: String,
        kind: CallGraphIssueKind,
        message: String,
    ) {
        self.issue_counter += 1;
        graph.issues.push(CallGraphIssue {
            id: format!("issue-{}", self.issue_counter),
            file,
            kind,
            message,
        });
    }
}

struct FileAnalysis {
    nodes: Vec<CallNode>,
    pending_edges: Vec<PendingCallEdge>,
    exports: HashMap<String, ExportTarget>,
    star_re_exports: Vec<PathBuf>,
    dependencies: Vec<PathBuf>,
    issues: Vec<AnalysisIssue>,
}

impl FileAnalysis {
    fn new() -> Self {
        Self {
            nodes: Vec::new(),
            pending_edges: Vec::new(),
            exports: HashMap::new(),
            star_re_exports: Vec::new(),
            dependencies: Vec::new(),
            issues: Vec::new(),
        }
    }
}

#[derive(Clone)]
struct AnalysisIssue {
    file: String,
    kind: CallGraphIssueKind,
    message: String,
}

#[derive(Clone)]
enum ExportTarget {
    LocalNode(String),
    ReExport {
        source_path: PathBuf,
        export_name: String,
    },
}

#[derive(Clone)]
struct ImportBinding {
    source_path: PathBuf,
    export_name: String,
}

#[derive(Clone)]
struct PendingCallEdge {
    source: String,
    target: PendingCallTarget,
    callee_name: String,
    kind: CallEdgeKind,
    confidence: CallConfidence,
}

#[derive(Clone)]
enum PendingCallTarget {
    Node(String),
    Export {
        source_path: PathBuf,
        export_name: String,
    },
}

fn analyze_file(file_path: &Path, resolver: &Resolver) -> FileAnalysis {
    let mut analysis = FileAnalysis::new();
    let source_text = match fs::read_to_string(file_path) {
        Ok(source_text) => source_text,
        Err(err) => {
            analysis.issues.push(AnalysisIssue {
                file: stable_path_string(file_path),
                kind: CallGraphIssueKind::ReadError,
                message: err.to_string(),
            });
            return analysis;
        }
    };

    let allocator = Allocator::default();
    let source_type = SourceType::from_path(file_path).unwrap_or_default();
    let parse_result = Parser::new(&allocator, &source_text, source_type).parse();

    if !parse_result.errors.is_empty() {
        analysis.issues.push(AnalysisIssue {
            file: stable_path_string(file_path),
            kind: CallGraphIssueKind::ParseError,
            message: parse_result
                .errors
                .iter()
                .map(|error| format!("{:?}", error))
                .collect::<Vec<_>>()
                .join("\n"),
        });
        return analysis;
    }

    let semantic_return = SemanticBuilder::new()
        .with_check_syntax_error(true)
        .build(&parse_result.program);
    let mut analyzer = FileCallAnalyzer::new(file_path, resolver, &semantic_return.semantic);

    for error in semantic_return.errors {
        analyzer.push_issue(CallGraphIssueKind::SemanticError, format!("{:?}", error));
    }

    analyzer.collect_functions();
    analyzer.collect_imports();
    analyzer.collect_exports();
    analyzer.collect_calls();
    analyzer.finish()
}

struct FileCallAnalyzer<'a> {
    file_path: &'a Path,
    file: String,
    resolver: &'a Resolver,
    semantic: &'a Semantic<'a>,
    analysis: FileAnalysis,
    function_node_to_call_node: HashMap<usize, String>,
    symbol_to_call_node: HashMap<usize, String>,
    name_to_call_nodes: HashMap<String, Vec<String>>,
    method_name_to_call_nodes: HashMap<String, Vec<String>>,
    imports_by_symbol: HashMap<usize, ImportBinding>,
    namespace_imports_by_symbol: HashMap<usize, PathBuf>,
    dependency_index: HashSet<PathBuf>,
}

impl<'a> FileCallAnalyzer<'a> {
    fn new(file_path: &'a Path, resolver: &'a Resolver, semantic: &'a Semantic<'a>) -> Self {
        Self {
            file_path,
            file: stable_path_string(file_path),
            resolver,
            semantic,
            analysis: FileAnalysis::new(),
            function_node_to_call_node: HashMap::new(),
            symbol_to_call_node: HashMap::new(),
            name_to_call_nodes: HashMap::new(),
            method_name_to_call_nodes: HashMap::new(),
            imports_by_symbol: HashMap::new(),
            namespace_imports_by_symbol: HashMap::new(),
            dependency_index: HashSet::new(),
        }
    }

    fn collect_functions(&mut self) {
        let nodes = self.semantic.nodes();

        for (node_id, node) in nodes.iter_enumerated() {
            match node.kind() {
                AstKind::VariableDeclarator(declarator) => {
                    self.collect_variable_function(declarator);
                }
                AstKind::MethodDefinition(method) => {
                    self.collect_method(method);
                }
                AstKind::Function(function)
                    if function.r#type == FunctionType::FunctionDeclaration =>
                {
                    self.collect_function_declaration(node_id.index(), function);
                }
                _ => {}
            }
        }

        for node in nodes.iter() {
            if let AstKind::Function(function) = node.kind()
                && let Some(identifier) = &function.id
                && let Some(call_node_id) = self
                    .function_node_to_call_node
                    .get(&function.node_id.get().index())
                    .cloned()
                && let Some(symbol_id) = identifier.symbol_id.get()
            {
                self.symbol_to_call_node
                    .insert(symbol_id.index(), call_node_id);
            }
        }
    }

    fn collect_imports(&mut self) {
        for node in self.semantic.nodes().iter() {
            let AstKind::ImportDeclaration(declaration) = node.kind() else {
                continue;
            };
            self.collect_import_declaration(declaration);
        }
    }

    fn collect_exports(&mut self) {
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

    fn collect_calls(&mut self) {
        let nodes = self.semantic.nodes();
        let scoping = self.semantic.scoping();

        for (node_id, node) in nodes.iter_enumerated() {
            let AstKind::CallExpression(call_expression) = node.kind() else {
                continue;
            };

            let Some(caller_id) = self.find_caller_id(nodes, node_id) else {
                continue;
            };

            if let Some((callee_name, symbol_id)) =
                resolve_direct_identifier_call(scoping, call_expression)
            {
                self.push_direct_call(caller_id, callee_name, symbol_id, call_expression.span);
                continue;
            }

            if let Some(member_call) = static_member_call(scoping, &call_expression.callee) {
                self.push_member_call(caller_id, member_call, call_expression.span);
            }
        }
    }

    fn finish(self) -> FileAnalysis {
        self.analysis
    }

    fn collect_function_declaration(&mut self, function_node_id: usize, function: &Function<'a>) {
        let Some(identifier) = &function.id else {
            return;
        };

        let name = identifier.name.as_str().to_string();
        let call_node_id = self.insert_function_node(
            function_node_id,
            &name,
            CallNodeKind::Function,
            function.span,
        );

        if let Some(symbol_id) = identifier.symbol_id.get() {
            self.symbol_to_call_node
                .insert(symbol_id.index(), call_node_id);
        }
    }

    fn collect_variable_function(&mut self, declarator: &VariableDeclarator<'a>) {
        let Some((function_node_id, kind, span)) = variable_function_metadata(declarator) else {
            return;
        };
        let Some(identifier) = binding_identifier(&declarator.id) else {
            return;
        };

        let name = identifier.name.as_str().to_string();
        let call_node_id = self.insert_function_node(function_node_id, &name, kind, span);

        if let Some(symbol_id) = identifier.symbol_id.get() {
            self.symbol_to_call_node
                .insert(symbol_id.index(), call_node_id);
        }
    }

    fn collect_method(&mut self, method: &MethodDefinition<'a>) {
        let Some(name) = property_key_name(&method.key) else {
            return;
        };

        let function_node_id = method.value.node_id.get().index();
        let call_node_id =
            self.insert_function_node(function_node_id, &name, CallNodeKind::Method, method.span);

        self.method_name_to_call_nodes
            .entry(name)
            .or_default()
            .push(call_node_id);
    }

    fn collect_import_declaration(&mut self, declaration: &ImportDeclaration<'a>) {
        let source = declaration.source.value.as_str();
        if !is_internal_import_specifier(source) {
            return;
        }

        let Some(source_path) = self.resolve_dependency(source) else {
            return;
        };

        if declaration.import_kind == ImportOrExportKind::Type {
            return;
        }

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
            if !is_internal_import_specifier(source) {
                return;
            }

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
        if !is_internal_import_specifier(source) {
            return;
        }

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

    fn local_function_by_name(&self, name: &str) -> Option<String> {
        let target_ids = self.name_to_call_nodes.get(name)?;
        if target_ids.len() == 1 {
            Some(target_ids[0].clone())
        } else {
            None
        }
    }

    fn resolve_dependency(&mut self, specifier: &str) -> Option<PathBuf> {
        match resolve_module_path(self.resolver, self.file_path, specifier) {
            Ok(path) => {
                if self.dependency_index.insert(path.clone()) && is_supported_source_file(&path) {
                    self.analysis.dependencies.push(path.clone());
                }
                Some(path)
            }
            Err(message) => {
                self.push_issue(
                    CallGraphIssueKind::ResolveError,
                    format!("{} -> {}", specifier, message),
                );
                None
            }
        }
    }

    fn push_direct_call(
        &mut self,
        caller_id: String,
        callee_name: String,
        symbol_id: usize,
        _span: Span,
    ) {
        if let Some(target_id) = self.symbol_to_call_node.get(&symbol_id).cloned() {
            self.push_pending_edge(
                caller_id,
                PendingCallTarget::Node(target_id),
                callee_name,
                CallEdgeKind::Direct,
                CallConfidence::High,
            );
            return;
        }

        if let Some(import_binding) = self.imports_by_symbol.get(&symbol_id).cloned() {
            self.push_pending_edge(
                caller_id,
                PendingCallTarget::Export {
                    source_path: import_binding.source_path,
                    export_name: import_binding.export_name,
                },
                callee_name,
                CallEdgeKind::Import,
                CallConfidence::High,
            );
        }
    }

    fn push_member_call(&mut self, caller_id: String, member_call: StaticMemberCall, _span: Span) {
        if let Some(object_symbol_id) = member_call.object_symbol_id
            && let Some(source_path) = self.namespace_imports_by_symbol.get(&object_symbol_id)
        {
            self.push_pending_edge(
                caller_id,
                PendingCallTarget::Export {
                    source_path: source_path.clone(),
                    export_name: member_call.property_name.clone(),
                },
                member_call.property_name,
                CallEdgeKind::Import,
                CallConfidence::High,
            );
            return;
        }

        let target_ids = self
            .method_name_to_call_nodes
            .get(&member_call.property_name)
            .cloned()
            .unwrap_or_default();

        if target_ids.len() == 1 {
            self.push_pending_edge(
                caller_id,
                PendingCallTarget::Node(target_ids[0].clone()),
                member_call.property_name,
                CallEdgeKind::Method,
                CallConfidence::Medium,
            );
        }
    }

    fn insert_function_node(
        &mut self,
        function_node_id: usize,
        name: &str,
        kind: CallNodeKind,
        span: Span,
    ) -> String {
        if let Some(existing_id) = self.function_node_to_call_node.get(&function_node_id) {
            return existing_id.clone();
        }

        let id = call_node_id(&self.file, name, span);
        self.analysis.nodes.push(CallNode {
            id: id.clone(),
            label: name.to_string(),
            name: name.to_string(),
            file: self.file.clone(),
            kind,
            status: CallNodeStatus::Resolved,
            span_start: span.start,
            span_end: span.end,
            is_entry: false,
        });

        self.function_node_to_call_node
            .insert(function_node_id, id.clone());
        self.name_to_call_nodes
            .entry(name.to_string())
            .or_default()
            .push(id.clone());
        id
    }

    fn push_pending_edge(
        &mut self,
        source: String,
        target: PendingCallTarget,
        callee_name: String,
        kind: CallEdgeKind,
        confidence: CallConfidence,
    ) {
        self.analysis.pending_edges.push(PendingCallEdge {
            source,
            target,
            callee_name,
            kind,
            confidence,
        });
    }

    fn push_issue(&mut self, kind: CallGraphIssueKind, message: String) {
        self.analysis.issues.push(AnalysisIssue {
            file: self.file.clone(),
            kind,
            message,
        });
    }

    fn find_caller_id(&self, nodes: &AstNodes<'a>, call_node_id: NodeId) -> Option<String> {
        nodes
            .ancestor_ids(call_node_id)
            .find_map(|ancestor_id| match nodes.kind(ancestor_id) {
                AstKind::Function(_) | AstKind::ArrowFunctionExpression(_) => self
                    .function_node_to_call_node
                    .get(&ancestor_id.index())
                    .cloned(),
                _ => None,
            })
    }
}

struct EdgeInsert {
    source: String,
    target: String,
    callee_name: String,
    kind: CallEdgeKind,
    confidence: CallConfidence,
    unresolved: bool,
}

fn push_edge(graph: &mut CallGraph, edge_index: &mut HashSet<String>, edge: EdgeInsert) {
    let id = format!("{}->{}::{}", edge.source, edge.target, edge.callee_name);
    if !edge_index.insert(id.clone()) {
        return;
    }

    graph.edges.push(CallEdge {
        id,
        source: edge.source,
        target: edge.target,
        callee_name: edge.callee_name,
        kind: edge.kind,
        confidence: edge.confidence,
        unresolved: edge.unresolved,
    });
}

fn filter_to_entry_neighborhood(
    graph: &mut CallGraph,
    entry_function: &str,
    issue_counter: &mut usize,
) {
    let entry_ids: HashSet<String> = graph
        .nodes
        .iter()
        .filter(|node| normalize_function_name(&node.name) == entry_function)
        .map(|node| node.id.clone())
        .collect();

    if entry_ids.is_empty() {
        *issue_counter += 1;
        graph.issues.push(CallGraphIssue {
            id: format!("issue-{}", issue_counter),
            file: String::new(),
            kind: CallGraphIssueKind::EntryFunctionNotFound,
            message: format!("entry function `{}` was not found", entry_function),
        });
        return;
    }

    for node in &mut graph.nodes {
        node.is_entry = entry_ids.contains(&node.id);
    }

    let mut visible_node_ids = entry_ids.clone();
    let mut visible_edge_ids = HashSet::new();

    for edge in &graph.edges {
        if entry_ids.contains(&edge.source) || entry_ids.contains(&edge.target) {
            visible_node_ids.insert(edge.source.clone());
            visible_node_ids.insert(edge.target.clone());
            visible_edge_ids.insert(edge.id.clone());
        }
    }

    graph
        .nodes
        .retain(|node| visible_node_ids.contains(&node.id));
    graph
        .edges
        .retain(|edge| visible_edge_ids.contains(&edge.id));
}

fn variable_function_metadata(
    declarator: &VariableDeclarator<'_>,
) -> Option<(usize, CallNodeKind, Span)> {
    match declarator.init.as_ref()? {
        Expression::ArrowFunctionExpression(function) => Some((
            function.node_id.get().index(),
            CallNodeKind::ArrowFunction,
            function.span,
        )),
        Expression::FunctionExpression(function) => Some((
            function.node_id.get().index(),
            CallNodeKind::Function,
            function.span,
        )),
        _ => None,
    }
}

fn binding_identifier<'a>(
    pattern: &'a BindingPattern<'a>,
) -> Option<&'a oxc_ast::ast::BindingIdentifier<'a>> {
    match pattern {
        BindingPattern::BindingIdentifier(identifier) => Some(identifier),
        _ => None,
    }
}

fn resolve_direct_identifier_call(
    scoping: &Scoping,
    call_expression: &CallExpression<'_>,
) -> Option<(String, usize)> {
    let identifier = direct_identifier_callee(&call_expression.callee)?;
    let symbol_id = symbol_id_for_reference(scoping, identifier)?;
    Some((identifier.name.as_str().to_string(), symbol_id))
}

fn symbol_id_for_reference(
    scoping: &Scoping,
    identifier: &IdentifierReference<'_>,
) -> Option<usize> {
    let reference_id = identifier.reference_id.get()?;
    let symbol_id = scoping.get_reference(reference_id).symbol_id()?;
    Some(symbol_id.index())
}

fn direct_identifier_callee<'a>(
    expression: &'a Expression<'a>,
) -> Option<&'a IdentifierReference<'a>> {
    match expression {
        Expression::Identifier(identifier) => Some(identifier),
        Expression::ParenthesizedExpression(expression) => {
            direct_identifier_callee(&expression.expression)
        }
        Expression::TSAsExpression(expression) => direct_identifier_callee(&expression.expression),
        Expression::TSSatisfiesExpression(expression) => {
            direct_identifier_callee(&expression.expression)
        }
        Expression::TSNonNullExpression(expression) => {
            direct_identifier_callee(&expression.expression)
        }
        Expression::TSInstantiationExpression(expression) => {
            direct_identifier_callee(&expression.expression)
        }
        _ => None,
    }
}

#[derive(Clone)]
struct StaticMemberCall {
    object_symbol_id: Option<usize>,
    property_name: String,
}

fn static_member_call(scoping: &Scoping, expression: &Expression<'_>) -> Option<StaticMemberCall> {
    match expression {
        Expression::StaticMemberExpression(member) => Some(StaticMemberCall {
            object_symbol_id: direct_identifier_callee(&member.object)
                .and_then(|identifier| symbol_id_for_reference(scoping, identifier)),
            property_name: member.property.name.as_str().to_string(),
        }),
        Expression::ParenthesizedExpression(expression) => {
            static_member_call(scoping, &expression.expression)
        }
        Expression::TSAsExpression(expression) => {
            static_member_call(scoping, &expression.expression)
        }
        Expression::TSSatisfiesExpression(expression) => {
            static_member_call(scoping, &expression.expression)
        }
        Expression::TSNonNullExpression(expression) => {
            static_member_call(scoping, &expression.expression)
        }
        Expression::TSInstantiationExpression(expression) => {
            static_member_call(scoping, &expression.expression)
        }
        _ => None,
    }
}

fn property_key_name(key: &PropertyKey<'_>) -> Option<String> {
    match key {
        PropertyKey::StaticIdentifier(identifier) => Some(identifier.name.as_str().to_string()),
        PropertyKey::PrivateIdentifier(identifier) => Some(identifier.name.as_str().to_string()),
        PropertyKey::StringLiteral(literal) => Some(literal.value.as_str().to_string()),
        _ => None,
    }
}

fn module_export_name(name: &ModuleExportName<'_>) -> Option<String> {
    match name {
        ModuleExportName::IdentifierName(identifier) => Some(identifier.name.as_str().to_string()),
        ModuleExportName::IdentifierReference(identifier) => {
            Some(identifier.name.as_str().to_string())
        }
        ModuleExportName::StringLiteral(literal) => Some(literal.value.as_str().to_string()),
    }
}

fn module_export_symbol(scoping: &Scoping, name: &ModuleExportName<'_>) -> Option<usize> {
    match name {
        ModuleExportName::IdentifierReference(identifier) => {
            symbol_id_for_reference(scoping, identifier)
        }
        _ => None,
    }
}

fn call_node_id(file: &str, name: &str, span: Span) -> String {
    format!("call:{}::{}@{}-{}", file, name, span.start, span.end)
}

fn normalize_entry_function(entry_function: Option<&str>) -> Option<&str> {
    let entry_function = entry_function?.trim();
    if entry_function.is_empty() {
        None
    } else {
        Some(entry_function.trim_end_matches("()"))
    }
}

fn normalize_function_name(name: &str) -> &str {
    name.trim_end_matches("()")
}

fn find_project_root(entry_path: &Path) -> PathBuf {
    let start_dir = entry_path.parent().unwrap_or(entry_path);
    let mut current = Some(start_dir);
    let mut fallback = start_dir.to_path_buf();

    while let Some(dir) = current {
        if dir.join("pnpm-workspace.yaml").exists() {
            return dir.to_path_buf();
        }
        if dir.join("package.json").exists() || dir.join("tsconfig.json").exists() {
            fallback = dir.to_path_buf();
        }
        current = dir.parent();
    }

    fallback
}

fn is_supported_source_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|extension| extension.to_str()),
        Some("ts" | "tsx" | "mts" | "cts" | "js" | "jsx" | "mjs" | "cjs")
    )
}

fn path_contains_segment(path: &Path, segment: &str) -> bool {
    path.components()
        .any(|component| component.as_os_str().to_string_lossy() == segment)
}

fn is_internal_import_specifier(specifier: &str) -> bool {
    specifier.starts_with("./") || specifier.starts_with("../") || specifier.starts_with("@/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn create_test_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("oxgraph-{}-{}", name, nanos));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn resolves_named_import_call_across_modules() {
        let dir = create_test_dir("named-import");
        fs::write(
            dir.join("main.ts"),
            "import { helper } from './util';\nfunction start() { helper(); }\n",
        )
        .unwrap();
        fs::write(
            dir.join("util.ts"),
            "export function helper() { return 1; }\n",
        )
        .unwrap();

        let graph = build_call_graph(dir.join("main.ts"), Some("start")).unwrap();

        assert!(graph.nodes.iter().any(|node| node.name == "start"));
        assert!(graph.nodes.iter().any(|node| node.name == "helper"));
        assert!(graph.edges.iter().any(|edge| {
            edge.callee_name == "helper"
                && edge.kind == CallEdgeKind::Import
                && edge.confidence == CallConfidence::High
                && !edge.unresolved
        }));

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn resolves_barrel_re_export_call_across_modules() {
        let dir = create_test_dir("barrel-re-export");
        fs::write(
            dir.join("main.ts"),
            "import { helper } from './index';\nfunction start() { helper(); }\n",
        )
        .unwrap();
        fs::write(dir.join("index.ts"), "export { helper } from './util';\n").unwrap();
        fs::write(
            dir.join("util.ts"),
            "export function helper() { return 1; }\n",
        )
        .unwrap();

        let graph = build_call_graph(dir.join("main.ts"), Some("start")).unwrap();

        assert!(graph.nodes.iter().any(|node| node.name == "start"));
        assert!(graph.nodes.iter().any(|node| node.name == "helper"));
        assert!(graph.edges.iter().any(|edge| {
            edge.callee_name == "helper"
                && edge.kind == CallEdgeKind::Import
                && edge.confidence == CallConfidence::High
                && !edge.unresolved
        }));

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn discards_external_imports_and_unresolved_native_calls() {
        let dir = create_test_dir("domain-only");
        fs::write(
            dir.join("main.ts"),
            r#"
import { useEffect, useState } from 'react';
import { helper } from './util';

function start(items: string[]) {
  useState();
  useEffect(() => {});
  items.map((item) => item.trim());
  console.log('debug');
  missingGlobal();
  helper();
}
"#,
        )
        .unwrap();
        fs::write(
            dir.join("util.ts"),
            "export function helper() { return 1; }\n",
        )
        .unwrap();

        let graph = build_call_graph(dir.join("main.ts"), Some("start")).unwrap();

        assert!(graph.nodes.iter().any(|node| node.name == "start"));
        assert!(graph.nodes.iter().any(|node| node.name == "helper"));
        assert!(graph.nodes.iter().all(|node| {
            !matches!(node.kind, CallNodeKind::Unresolved)
                && !matches!(
                    node.name.as_str(),
                    "useState" | "useEffect" | "map" | "trim" | "log" | "missingGlobal"
                )
        }));
        assert_eq!(graph.edges.len(), 1);
        assert_eq!(graph.edges[0].callee_name, "helper");
        assert_eq!(graph.edges[0].kind, CallEdgeKind::Import);
        assert!(!graph.edges[0].unresolved);

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn keeps_same_file_calls_and_unique_local_methods() {
        let dir = create_test_dir("local-methods");
        fs::write(
            dir.join("main.ts"),
            r#"
class Service {
  save() {}
}

function helper() {}

function start(service: Service) {
  helper();
  service.save();
  ['a'].filter(Boolean);
}
"#,
        )
        .unwrap();

        let graph = build_call_graph(dir.join("main.ts"), Some("start")).unwrap();
        let callees: HashSet<&str> = graph
            .edges
            .iter()
            .map(|edge| edge.callee_name.as_str())
            .collect();

        assert!(callees.contains("helper"));
        assert!(callees.contains("save"));
        assert!(!callees.contains("filter"));
        assert!(graph.edges.iter().all(|edge| !edge.unresolved));

        fs::remove_dir_all(dir).ok();
    }
}
