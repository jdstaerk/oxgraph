use serde::Serialize;

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
