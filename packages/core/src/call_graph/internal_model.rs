use super::model::{CallConfidence, CallEdgeKind, CallGraphIssueKind, CallNode};
use std::path::PathBuf;

pub(crate) struct FileAnalysis {
    pub(crate) nodes: Vec<CallNode>,
    pub(crate) pending_edges: Vec<PendingCallEdge>,
    pub(crate) exports: std::collections::HashMap<String, ExportTarget>,
    pub(crate) star_re_exports: Vec<PathBuf>,
    pub(crate) dependencies: Vec<PathBuf>,
    pub(crate) issues: Vec<AnalysisIssue>,
}

impl FileAnalysis {
    pub(crate) fn new() -> Self {
        Self {
            nodes: Vec::new(),
            pending_edges: Vec::new(),
            exports: std::collections::HashMap::new(),
            star_re_exports: Vec::new(),
            dependencies: Vec::new(),
            issues: Vec::new(),
        }
    }
}

#[derive(Clone)]
pub(crate) struct AnalysisIssue {
    pub(crate) file: String,
    pub(crate) kind: CallGraphIssueKind,
    pub(crate) message: String,
}

#[derive(Clone)]
pub(crate) enum ExportTarget {
    LocalNode(String),
    ReExport {
        source_path: PathBuf,
        export_name: String,
    },
}

#[derive(Clone)]
pub(crate) struct ImportBinding {
    pub(crate) source_path: PathBuf,
    pub(crate) export_name: String,
}

#[derive(Clone)]
pub(crate) struct PendingCallEdge {
    pub(crate) source: String,
    pub(crate) target: PendingCallTarget,
    pub(crate) callee_name: String,
    pub(crate) kind: CallEdgeKind,
    pub(crate) confidence: CallConfidence,
}

#[derive(Clone)]
pub(crate) enum PendingCallTarget {
    Node(String),
    Export {
        source_path: PathBuf,
        export_name: String,
    },
}
