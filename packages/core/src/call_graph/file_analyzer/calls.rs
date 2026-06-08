use super::super::ast_utils::{
    StaticMemberCall, resolve_direct_identifier_call, resolve_jsx_component_call,
    static_member_call,
};
use super::super::internal_model::{PendingCallEdge, PendingCallTarget};
use super::super::model::{CallConfidence, CallEdgeKind};
use super::FileCallAnalyzer;
use oxc_ast::AstKind;
use oxc_semantic::{AstNodes, NodeId};
use oxc_span::Span;

impl<'a> FileCallAnalyzer<'a> {
    pub(super) fn collect_calls(&mut self) {
        let nodes = self.semantic.nodes();
        let scoping = self.semantic.scoping();

        for (node_id, node) in nodes.iter_enumerated() {
            let Some(caller_id) = self.find_caller_id(nodes, node_id) else {
                continue;
            };

            match node.kind() {
                AstKind::CallExpression(call_expression) => {
                    if let Some((callee_name, symbol_id)) =
                        resolve_direct_identifier_call(scoping, call_expression)
                    {
                        self.push_direct_call(
                            caller_id,
                            callee_name,
                            symbol_id,
                            call_expression.span,
                        );
                        continue;
                    }

                    if let Some(member_call) = static_member_call(scoping, &call_expression.callee)
                    {
                        self.push_member_call(caller_id, member_call, call_expression.span);
                    }
                }
                AstKind::JSXOpeningElement(opening_element) => {
                    if let Some((callee_name, symbol_id)) =
                        resolve_jsx_component_call(scoping, opening_element)
                    {
                        self.push_direct_call(
                            caller_id,
                            callee_name,
                            symbol_id,
                            opening_element.span,
                        );
                    }
                }
                _ => {}
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
