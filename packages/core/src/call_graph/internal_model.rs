use super::model::{CallConfidence, CallEdgeKind, CallGraphIssueKind, CallNode};
use std::path::PathBuf;

pub(super) struct FileAnalysis {
    pub(super) nodes: Vec<CallNode>,
    pub(super) pending_edges: Vec<PendingCallEdge>,
    pub(super) exports: std::collections::HashMap<String, ExportTarget>,
    pub(super) star_re_exports: Vec<PathBuf>,
    pub(super) dependencies: Vec<PathBuf>,
    pub(super) issues: Vec<AnalysisIssue>,
}

impl FileAnalysis {
    pub(super) fn new() -> Self {
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
pub(super) struct AnalysisIssue {
    pub(super) file: String,
    pub(super) kind: CallGraphIssueKind,
    pub(super) message: String,
}

#[derive(Clone)]
pub(super) enum ExportTarget {
    LocalNode(String),
    ReExport {
        source_path: PathBuf,
        export_name: String,
    },
}

#[derive(Clone)]
pub(super) struct ImportBinding {
    pub(super) source_path: PathBuf,
    pub(super) export_name: String,
}

#[derive(Clone)]
pub(super) struct PendingCallEdge {
    pub(super) source: String,
    pub(super) target: PendingCallTarget,
    pub(super) callee_name: String,
    pub(super) kind: CallEdgeKind,
    pub(super) confidence: CallConfidence,
}

#[derive(Clone)]
pub(super) enum PendingCallTarget {
    Node(String),
    Export {
        source_path: PathBuf,
        export_name: String,
    },
}
