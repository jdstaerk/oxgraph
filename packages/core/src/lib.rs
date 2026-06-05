#![deny(clippy::all)]

pub mod graph;
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

#[napi]
pub fn extract_graph(target_path: String) -> Result<GraphData> {
    let graph =
        build_graph(Path::new(&target_path)).map_err(|err| Error::from_reason(err.to_string()))?;
    Ok(graph.into())
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

fn node_kind_to_string(kind: &NodeKind) -> String {
    match kind {
        NodeKind::Entry => "entry",
        NodeKind::File => "file",
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

fn graph_issue_kind_to_string(kind: &GraphIssueKind) -> String {
    match kind {
        GraphIssueKind::ReadError => "readError",
        GraphIssueKind::ParseError => "parseError",
        GraphIssueKind::ResolveError => "resolveError",
    }
    .to_string()
}
