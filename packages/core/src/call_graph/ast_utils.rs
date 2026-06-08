use super::model::CallNodeKind;
use oxc_ast::ast::{
    BindingPattern, CallExpression, Expression, IdentifierReference, JSXElementName,
    JSXOpeningElement, ModuleExportName, PropertyKey, VariableDeclarator,
};
use oxc_semantic::Scoping;
use oxc_span::Span;

pub(super) fn variable_function_metadata(
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

pub(super) fn binding_identifier<'a>(
    pattern: &'a BindingPattern<'a>,
) -> Option<&'a oxc_ast::ast::BindingIdentifier<'a>> {
    match pattern {
        BindingPattern::BindingIdentifier(identifier) => Some(identifier),
        _ => None,
    }
}

pub(super) fn resolve_direct_identifier_call(
    scoping: &Scoping,
    call_expression: &CallExpression<'_>,
) -> Option<(String, usize)> {
    let identifier = direct_identifier_callee(&call_expression.callee)?;
    let symbol_id = symbol_id_for_reference(scoping, identifier)?;
    Some((identifier.name.as_str().to_string(), symbol_id))
}

pub(super) fn resolve_jsx_component_call(
    scoping: &Scoping,
    opening_element: &JSXOpeningElement<'_>,
) -> Option<(String, usize)> {
    let identifier = jsx_component_identifier(opening_element)?;
    let component_name = identifier.name.as_str();
    if !is_component_name(component_name) {
        return None;
    }

    let symbol_id = symbol_id_for_reference(scoping, identifier)?;
    Some((component_name.to_string(), symbol_id))
}

pub(super) fn symbol_id_for_reference(
    scoping: &Scoping,
    identifier: &IdentifierReference<'_>,
) -> Option<usize> {
    let reference_id = identifier.reference_id.get()?;
    let symbol_id = scoping.get_reference(reference_id).symbol_id()?;
    Some(symbol_id.index())
}

pub(super) fn direct_identifier_callee<'a>(
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

fn jsx_component_identifier<'a>(
    opening_element: &'a JSXOpeningElement<'a>,
) -> Option<&'a IdentifierReference<'a>> {
    match &opening_element.name {
        JSXElementName::IdentifierReference(identifier) => Some(identifier),
        _ => None,
    }
}

fn is_component_name(name: &str) -> bool {
    name.chars()
        .next()
        .is_some_and(|character| character.is_ascii_uppercase())
}

#[derive(Clone)]
pub(super) struct StaticMemberCall {
    pub(super) object_symbol_id: Option<usize>,
    pub(super) property_name: String,
}

pub(super) fn static_member_call(
    scoping: &Scoping,
    expression: &Expression<'_>,
) -> Option<StaticMemberCall> {
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

pub(super) fn property_key_name(key: &PropertyKey<'_>) -> Option<String> {
    match key {
        PropertyKey::StaticIdentifier(identifier) => Some(identifier.name.as_str().to_string()),
        PropertyKey::PrivateIdentifier(identifier) => Some(identifier.name.as_str().to_string()),
        PropertyKey::StringLiteral(literal) => Some(literal.value.as_str().to_string()),
        _ => None,
    }
}

pub(super) fn module_export_name(name: &ModuleExportName<'_>) -> Option<String> {
    match name {
        ModuleExportName::IdentifierName(identifier) => Some(identifier.name.as_str().to_string()),
        ModuleExportName::IdentifierReference(identifier) => {
            Some(identifier.name.as_str().to_string())
        }
        ModuleExportName::StringLiteral(literal) => Some(literal.value.as_str().to_string()),
    }
}

pub(super) fn module_export_symbol(
    scoping: &Scoping,
    name: &ModuleExportName<'_>,
) -> Option<usize> {
    match name {
        ModuleExportName::IdentifierReference(identifier) => {
            symbol_id_for_reference(scoping, identifier)
        }
        _ => None,
    }
}

pub(super) fn call_node_id(file: &str, name: &str, span: Span) -> String {
    format!("call:{}::{}@{}-{}", file, name, span.start, span.end)
}
