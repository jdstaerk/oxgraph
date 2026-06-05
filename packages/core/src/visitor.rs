use oxc_ast::ast::{
    Argument, CallExpression, ExportAllDeclaration, ExportNamedDeclaration, Expression,
    ImportDeclaration, ImportExpression,
};
use oxc_ast_visit::{Visit, walk::walk_call_expression};

#[derive(Default, Debug)]
pub struct ImportVisitor {
    pub imports: Vec<String>,
}

impl ImportVisitor {
    pub fn new() -> Self {
        Self {
            imports: Vec::new(),
        }
    }

    fn add_import(&mut self, target_path: &str) {
        self.imports.push(target_path.to_string());
    }
}

impl<'a> Visit<'a> for ImportVisitor {
    // 1. Static ESM Imports: import { x } from './utils'
    fn visit_import_declaration(&mut self, it: &ImportDeclaration<'a>) {
        self.add_import(it.source.value.as_str());
    }

    // 2. Dynamic Imports: import('./utils')
    fn visit_import_expression(&mut self, it: &ImportExpression<'a>) {
        if let Expression::StringLiteral(str_lit) = &it.source {
            self.add_import(str_lit.value.as_str());
        }
    }

    // 3. Named Re-exports: export { x } from './utils'
    fn visit_export_named_declaration(&mut self, it: &ExportNamedDeclaration<'a>) {
        if let Some(source) = &it.source {
            self.add_import(source.value.as_str());
        }
    }

    // 4. Export All: export * from './utils'
    fn visit_export_all_declaration(&mut self, it: &ExportAllDeclaration<'a>) {
        self.add_import(it.source.value.as_str());
    }

    // 5. CommonJS: require('./utils')
    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        if let Expression::Identifier(ident) = &it.callee {
            if ident.name == "require" && it.arguments.len() == 1 {
                if let Argument::StringLiteral(str_lit) = &it.arguments[0] {
                    self.add_import(str_lit.value.as_str());
                }
            }
        }
        walk_call_expression(self, it);
    }
}
