use super::super::ast_utils::{
    binding_identifier, call_node_id, property_key_name, variable_function_metadata,
};
use super::super::model::{CallNode, CallNodeKind, CallNodeStatus};
use super::FileCallAnalyzer;
use oxc_ast::AstKind;
use oxc_ast::ast::{Function, FunctionType, MethodDefinition, VariableDeclarator};
use oxc_span::Span;

impl<'a> FileCallAnalyzer<'a> {
    pub(super) fn collect_functions(&mut self) {
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

    pub(super) fn insert_function_node(
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

    pub(super) fn local_function_by_name(&self, name: &str) -> Option<String> {
        let target_ids = self.name_to_call_nodes.get(name)?;
        if target_ids.len() == 1 {
            Some(target_ids[0].clone())
        } else {
            None
        }
    }
}
