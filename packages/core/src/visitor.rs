use oxc_ast::ast::{
    Argument, CallExpression, ExportAllDeclaration, ExportNamedDeclaration, Expression,
    ImportDeclaration, ImportExpression,
};
use oxc_ast_visit::{Visit, walk::walk_call_expression};

#[derive(Default, Debug)]
pub struct ImportVisitor {
    pub import_specifiers: Vec<String>,
}

impl ImportVisitor {
    pub fn new() -> Self {
        Self::default()
    }

    fn add_import_specifier(&mut self, specifier: &str) {
        self.import_specifiers.push(specifier.to_string());
    }
}

impl<'a> Visit<'a> for ImportVisitor {
    fn visit_import_declaration(&mut self, declaration: &ImportDeclaration<'a>) {
        self.add_import_specifier(declaration.source.value.as_str());
    }

    fn visit_import_expression(&mut self, import_expression: &ImportExpression<'a>) {
        if let Expression::StringLiteral(string_literal) = &import_expression.source {
            self.add_import_specifier(string_literal.value.as_str());
        }
    }

    fn visit_export_named_declaration(&mut self, declaration: &ExportNamedDeclaration<'a>) {
        if let Some(source) = &declaration.source {
            self.add_import_specifier(source.value.as_str());
        }
    }

    fn visit_export_all_declaration(&mut self, declaration: &ExportAllDeclaration<'a>) {
        self.add_import_specifier(declaration.source.value.as_str());
    }

    fn visit_call_expression(&mut self, call_expression: &CallExpression<'a>) {
        if let Expression::Identifier(identifier) = &call_expression.callee
            && identifier.name == "require"
            && call_expression.arguments.len() == 1
            && let Argument::StringLiteral(string_literal) = &call_expression.arguments[0]
        {
            self.add_import_specifier(string_literal.value.as_str());
        }
        walk_call_expression(self, call_expression);
    }
}
