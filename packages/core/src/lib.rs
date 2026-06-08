#![deny(clippy::all)]

pub mod call_graph;
pub mod graph;
pub mod module_resolver;
pub mod path_utils;
pub mod visitor;

use napi::bindgen_prelude::*;
use napi_derive::napi;
use oxc_allocator::Allocator;
use oxc_ast_visit::Visit;
use oxc_parser::Parser;
use oxc_span::SourceType;
use serde::Serialize;
use std::path::Path;
use visitor::ImportVisitor;

pub use call_graph::{
    CallConfidence, CallEdge, CallEdgeKind, CallGraph, CallGraphBuildError, CallGraphIssueKind,
    CallNode, CallNodeKind, CallNodeStatus, build_call_graph,
};
pub use graph::{
    Edge, Graph, GraphBuildError, GraphIssueKind, Node, NodeKind, NodeStatus, build_graph,
};

/// Extracts import specifiers from a JavaScript or TypeScript source string.
pub fn extract_imports(
    file_path: &str,
    source_text: &str,
) -> std::result::Result<Vec<String>, String> {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path(file_path).unwrap_or_default();
    let parse_result = Parser::new(&allocator, source_text, source_type).parse();

    if !parse_result.errors.is_empty() {
        let error_messages: Vec<String> = parse_result
            .errors
            .iter()
            .map(|error| format!("{:?}", error))
            .collect();
        return Err(error_messages.join("\n"));
    }

    let mut visitor = ImportVisitor::new();
    visitor.visit_program(&parse_result.program);
    Ok(visitor.import_specifiers)
}

#[derive(Debug, Serialize)]
#[napi(object)]
pub struct GraphData {
    pub nodes: Vec<ReactFlowNode>,
    pub edges: Vec<ReactFlowEdge>,
    pub issues: Vec<GraphIssueData>,
}

#[derive(Debug, Serialize)]
#[napi(object)]
pub struct NodeData {
    pub label: String,
    pub path: String,
    pub kind: String,
    pub status: String,
    #[serde(rename = "isEntry")]
    #[napi(js_name = "isEntry")]
    pub is_entry: bool,
}

#[derive(Debug, Serialize)]
#[napi(object)]
pub struct ReactFlowNode {
    pub id: String,
    #[serde(rename = "type")]
    #[napi(js_name = "type")]
    pub node_type: String,
    pub data: NodeData,
}

#[derive(Debug, Serialize)]
#[napi(object)]
pub struct EdgeData {
    pub specifier: String,
    #[serde(rename = "isCircular")]
    #[napi(js_name = "isCircular")]
    pub is_circular: bool,
    pub unresolved: bool,
}

#[derive(Debug, Serialize)]
#[napi(object)]
pub struct ReactFlowEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub data: EdgeData,
}

#[derive(Debug, Serialize)]
#[napi(object)]
pub struct GraphIssueData {
    pub id: String,
    pub file: String,
    pub kind: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[napi(object)]
pub struct CallGraphData {
    pub nodes: Vec<ReactFlowCallNode>,
    pub edges: Vec<ReactFlowCallEdge>,
    pub issues: Vec<CallGraphIssueData>,
}

#[derive(Debug, Serialize)]
#[napi(object)]
pub struct CallNodeData {
    pub label: String,
    pub name: String,
    pub file: String,
    pub kind: String,
    pub status: String,
    #[serde(rename = "spanStart")]
    #[napi(js_name = "spanStart")]
    pub span_start: u32,
    #[serde(rename = "spanEnd")]
    #[napi(js_name = "spanEnd")]
    pub span_end: u32,
    #[serde(rename = "isEntry")]
    #[napi(js_name = "isEntry")]
    pub is_entry: bool,
}

#[derive(Debug, Serialize)]
#[napi(object)]
pub struct ReactFlowCallNode {
    pub id: String,
    #[serde(rename = "type")]
    #[napi(js_name = "type")]
    pub node_type: String,
    pub data: CallNodeData,
}

#[derive(Debug, Serialize)]
#[napi(object)]
pub struct CallEdgeData {
    #[serde(rename = "calleeName")]
    #[napi(js_name = "calleeName")]
    pub callee_name: String,
    pub kind: String,
    pub confidence: String,
    pub unresolved: bool,
}

#[derive(Debug, Serialize)]
#[napi(object)]
pub struct ReactFlowCallEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub data: CallEdgeData,
}

#[derive(Debug, Serialize)]
#[napi(object)]
pub struct CallGraphIssueData {
    pub id: String,
    pub file: String,
    pub kind: String,
    pub message: String,
}

#[napi]
pub fn extract_graph(target_path: String) -> Result<GraphData> {
    let graph =
        build_graph(Path::new(&target_path)).map_err(|err| Error::from_reason(err.to_string()))?;
    Ok(graph.into())
}

#[napi]
pub fn extract_call_graph(
    target_path: String,
    entry_function: Option<String>,
) -> Result<CallGraphData> {
    let call_graph = build_call_graph(Path::new(&target_path), entry_function.as_deref())
        .map_err(|err| Error::from_reason(err.to_string()))?;
    Ok(call_graph.into())
}

impl From<Graph> for GraphData {
    fn from(graph: Graph) -> Self {
        Self {
            nodes: graph.nodes.into_iter().map(ReactFlowNode::from).collect(),
            edges: graph.edges.into_iter().map(ReactFlowEdge::from).collect(),
            issues: graph.issues.into_iter().map(GraphIssueData::from).collect(),
        }
    }
}

impl From<CallGraph> for CallGraphData {
    fn from(graph: CallGraph) -> Self {
        Self {
            nodes: graph
                .nodes
                .into_iter()
                .map(ReactFlowCallNode::from)
                .collect(),
            edges: graph
                .edges
                .into_iter()
                .map(ReactFlowCallEdge::from)
                .collect(),
            issues: graph
                .issues
                .into_iter()
                .map(CallGraphIssueData::from)
                .collect(),
        }
    }
}

impl From<Node> for ReactFlowNode {
    fn from(node: Node) -> Self {
        let kind = node_kind_to_string(&node.kind);
        let status = node_status_to_string(&node.status);

        Self {
            id: node.id,
            node_type: "custom".to_string(),
            data: NodeData {
                label: node.label,
                path: node.path,
                kind,
                status,
                is_entry: node.is_entry,
            },
        }
    }
}

impl From<CallNode> for ReactFlowCallNode {
    fn from(node: CallNode) -> Self {
        Self {
            id: node.id,
            node_type: "call".to_string(),
            data: CallNodeData {
                label: node.label,
                name: node.name,
                file: node.file,
                kind: call_node_kind_to_string(&node.kind),
                status: call_node_status_to_string(&node.status),
                span_start: node.span_start,
                span_end: node.span_end,
                is_entry: node.is_entry,
            },
        }
    }
}

impl From<Edge> for ReactFlowEdge {
    fn from(edge: Edge) -> Self {
        Self {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            data: EdgeData {
                specifier: edge.specifier,
                is_circular: edge.is_circular,
                unresolved: edge.unresolved,
            },
        }
    }
}

impl From<CallEdge> for ReactFlowCallEdge {
    fn from(edge: CallEdge) -> Self {
        Self {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            data: CallEdgeData {
                callee_name: edge.callee_name,
                kind: call_edge_kind_to_string(&edge.kind),
                confidence: call_confidence_to_string(&edge.confidence),
                unresolved: edge.unresolved,
            },
        }
    }
}

impl From<graph::GraphIssue> for GraphIssueData {
    fn from(issue: graph::GraphIssue) -> Self {
        Self {
            id: issue.id,
            file: issue.file,
            kind: graph_issue_kind_to_string(&issue.kind),
            message: issue.message,
        }
    }
}

impl From<call_graph::CallGraphIssue> for CallGraphIssueData {
    fn from(issue: call_graph::CallGraphIssue) -> Self {
        Self {
            id: issue.id,
            file: issue.file,
            kind: call_graph_issue_kind_to_string(&issue.kind),
            message: issue.message,
        }
    }
}

fn node_kind_to_string(kind: &NodeKind) -> String {
    match kind {
        NodeKind::Entry => "entry",
        NodeKind::File => "file",
        NodeKind::External => "external",
        NodeKind::Ghost => "ghost",
    }
    .to_string()
}

fn node_status_to_string(status: &NodeStatus) -> String {
    match status {
        NodeStatus::Resolved => "resolved",
        NodeStatus::Unresolved => "unresolved",
        NodeStatus::SyntaxError => "syntaxError",
        NodeStatus::ReadError => "readError",
    }
    .to_string()
}

fn call_node_kind_to_string(kind: &CallNodeKind) -> String {
    match kind {
        CallNodeKind::Function => "function",
        CallNodeKind::Method => "method",
        CallNodeKind::ArrowFunction => "arrowFunction",
        CallNodeKind::Unresolved => "unresolved",
    }
    .to_string()
}

fn call_node_status_to_string(status: &CallNodeStatus) -> String {
    match status {
        CallNodeStatus::Resolved => "resolved",
        CallNodeStatus::Unresolved => "unresolved",
    }
    .to_string()
}

fn call_edge_kind_to_string(kind: &CallEdgeKind) -> String {
    match kind {
        CallEdgeKind::Direct => "direct",
        CallEdgeKind::Import => "import",
        CallEdgeKind::Method => "method",
        CallEdgeKind::Unresolved => "unresolved",
    }
    .to_string()
}

fn call_confidence_to_string(confidence: &CallConfidence) -> String {
    match confidence {
        CallConfidence::High => "high",
        CallConfidence::Medium => "medium",
        CallConfidence::Low => "low",
    }
    .to_string()
}

fn graph_issue_kind_to_string(kind: &GraphIssueKind) -> String {
    match kind {
        GraphIssueKind::ReadError => "readError",
        GraphIssueKind::ParseError => "parseError",
        GraphIssueKind::ResolveError => "resolveError",
    }
    .to_string()
}

fn call_graph_issue_kind_to_string(kind: &CallGraphIssueKind) -> String {
    match kind {
        CallGraphIssueKind::ReadError => "readError",
        CallGraphIssueKind::ParseError => "parseError",
        CallGraphIssueKind::ResolveError => "resolveError",
        CallGraphIssueKind::SemanticError => "semanticError",
        CallGraphIssueKind::EntryFunctionNotFound => "entryFunctionNotFound",
    }
    .to_string()
}
