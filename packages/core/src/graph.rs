use crate::extract_imports;
use crate::module_resolver::{create_module_resolver, resolve_module_path};
use crate::path_utils::{
    EntryPathError, label_from_path, normalize_existing_path, resolve_entry_path,
    stable_path_string,
};
use oxc_resolver::Resolver;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Graph {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub issues: Vec<GraphIssue>,
}

impl Graph {
    pub fn new() -> Self {
        Self {
            nodes: Vec::new(),
            edges: Vec::new(),
            issues: Vec::new(),
        }
    }
}

impl Default for Graph {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum NodeKind {
    Entry,
    File,
    Ghost,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum NodeStatus {
    Resolved,
    Unresolved,
    SyntaxError,
    ReadError,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: String,
    pub label: String,
    pub path: String,
    pub kind: NodeKind,
    pub status: NodeStatus,
    pub is_entry: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Edge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub specifier: String,
    pub is_circular: bool,
    pub unresolved: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum GraphIssueKind {
    ReadError,
    ParseError,
    ResolveError,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GraphIssue {
    pub id: String,
    pub file: String,
    pub kind: GraphIssueKind,
    pub message: String,
}

#[derive(Debug)]
pub enum GraphBuildError {
    EntryNotFound { path: PathBuf },
    EntryReadFailed { path: PathBuf, message: String },
}

impl fmt::Display for GraphBuildError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EntryNotFound { path } => {
                write!(f, "entry file does not exist: {}", path.display())
            }
            Self::EntryReadFailed { path, message } => {
                write!(
                    f,
                    "failed to read entry file {}: {}",
                    path.display(),
                    message
                )
            }
        }
    }
}

impl std::error::Error for GraphBuildError {}

impl From<EntryPathError> for GraphBuildError {
    fn from(error: EntryPathError) -> Self {
        match error {
            EntryPathError::NotFound { path } => Self::EntryNotFound { path },
            EntryPathError::ReadFailed { path, message } => Self::EntryReadFailed { path, message },
        }
    }
}

pub fn build_graph(entry_file: impl AsRef<Path>) -> Result<Graph, GraphBuildError> {
    let entry_path = resolve_entry_path(entry_file.as_ref())?;

    let resolver = create_module_resolver(&entry_path);
    let mut builder = GraphBuilder::new(resolver);
    builder.walk(&entry_path, true);
    Ok(builder.graph)
}

fn node_id_from_path(path: &Path) -> String {
    stable_path_string(path)
}

fn ghost_node_id(source: &Path, specifier: &str) -> String {
    format!("ghost:{}::{}", stable_path_string(source), specifier)
}

struct GraphBuilder {
    graph: Graph,
    resolver: Resolver,
    visited: HashSet<PathBuf>,
    in_progress: HashSet<PathBuf>,
    node_index: HashMap<String, usize>,
    ghost_index: HashMap<String, String>,
    issue_counter: usize,
}

impl GraphBuilder {
    fn new(resolver: Resolver) -> Self {
        Self {
            graph: Graph::default(),
            resolver,
            visited: HashSet::new(),
            in_progress: HashSet::new(),
            node_index: HashMap::new(),
            ghost_index: HashMap::new(),
            issue_counter: 0,
        }
    }

    fn walk(&mut self, file_path: &Path, is_entry: bool) {
        let normalized = match normalize_existing_path(file_path) {
            Ok(path) => path,
            Err(message) => {
                self.push_issue(file_path, GraphIssueKind::ReadError, message.clone());
                self.upsert_node(
                    file_path,
                    if is_entry {
                        NodeKind::Entry
                    } else {
                        NodeKind::File
                    },
                    NodeStatus::ReadError,
                    is_entry,
                    Some(file_path),
                );
                return;
            }
        };

        let node_kind = if is_entry {
            NodeKind::Entry
        } else {
            NodeKind::File
        };
        self.upsert_node(
            &normalized,
            node_kind,
            NodeStatus::Resolved,
            is_entry,
            Some(&normalized),
        );

        if self.visited.contains(&normalized) {
            return;
        }
        if !self.in_progress.insert(normalized.clone()) {
            return;
        }

        let source_text = match fs::read_to_string(&normalized) {
            Ok(content) => content,
            Err(err) => {
                self.push_issue(&normalized, GraphIssueKind::ReadError, err.to_string());
                self.mark_node_status(&normalized, NodeStatus::ReadError);
                self.in_progress.remove(&normalized);
                return;
            }
        };

        let import_specifiers = match extract_imports(&normalized.to_string_lossy(), &source_text) {
            Ok(specifiers) => specifiers,
            Err(message) => {
                self.push_issue(&normalized, GraphIssueKind::ParseError, message);
                self.mark_node_status(&normalized, NodeStatus::SyntaxError);
                self.visited.insert(normalized.clone());
                self.in_progress.remove(&normalized);
                return;
            }
        };

        let current_node_id = node_id_from_path(&normalized);

        for specifier in import_specifiers {
            match resolve_module_path(&self.resolver, &normalized, &specifier) {
                Ok(resolved_target_path) => {
                    let target_node_id = node_id_from_path(&resolved_target_path);
                    let is_circular = self.in_progress.contains(&resolved_target_path);
                    let edge_id = format!("{}->{}", current_node_id, target_node_id);

                    self.push_edge(
                        edge_id,
                        current_node_id.clone(),
                        target_node_id.clone(),
                        specifier,
                        is_circular,
                        false,
                    );

                    self.upsert_node(
                        &resolved_target_path,
                        NodeKind::File,
                        NodeStatus::Resolved,
                        false,
                        Some(&resolved_target_path),
                    );

                    if !is_circular && !self.visited.contains(&resolved_target_path) {
                        self.walk(&resolved_target_path, false);
                    }
                }
                Err(err) => {
                    self.push_issue(
                        &normalized,
                        GraphIssueKind::ResolveError,
                        format!("{} -> {}", specifier, err),
                    );
                    let ghost_id = self
                        .ghost_index
                        .entry(format!("{}::{}", normalized.display(), specifier))
                        .or_insert_with(|| ghost_node_id(&normalized, &specifier))
                        .clone();

                    self.upsert_ghost_node(&ghost_id, specifier.as_str());
                    self.push_edge(
                        format!("{}->{}", current_node_id, ghost_id),
                        current_node_id.clone(),
                        ghost_id,
                        specifier,
                        false,
                        true,
                    );
                }
            }
        }

        self.visited.insert(normalized.clone());
        self.in_progress.remove(&normalized);
    }

    fn upsert_node(
        &mut self,
        path: &Path,
        kind: NodeKind,
        status: NodeStatus,
        is_entry: bool,
        display_path: Option<&Path>,
    ) {
        let id = node_id_from_path(path);
        let label = display_path
            .map(label_from_path)
            .unwrap_or_else(|| id.clone());
        let serialized_path = display_path
            .map(stable_path_string)
            .unwrap_or_else(|| id.clone());

        if let Some(index) = self.node_index.get(&id).copied() {
            let node = &mut self.graph.nodes[index];
            node.kind = kind;
            node.status = status;
            node.is_entry = is_entry;
            node.label = label;
            node.path = serialized_path;
            return;
        }

        let index = self.graph.nodes.len();
        self.graph.nodes.push(Node {
            id: id.clone(),
            label,
            path: serialized_path,
            kind,
            status,
            is_entry,
        });
        self.node_index.insert(id, index);
    }

    fn upsert_ghost_node(&mut self, ghost_id: &str, label: &str) {
        if let Some(index) = self.node_index.get(ghost_id).copied() {
            let node = &mut self.graph.nodes[index];
            node.kind = NodeKind::Ghost;
            node.status = NodeStatus::Unresolved;
            node.is_entry = false;
            node.label = label.to_string();
            node.path = label.to_string();
            return;
        }

        let index = self.graph.nodes.len();
        self.graph.nodes.push(Node {
            id: ghost_id.to_string(),
            label: label.to_string(),
            path: label.to_string(),
            kind: NodeKind::Ghost,
            status: NodeStatus::Unresolved,
            is_entry: false,
        });
        self.node_index.insert(ghost_id.to_string(), index);
    }

    fn mark_node_status(&mut self, path: &Path, status: NodeStatus) {
        let id = node_id_from_path(path);
        if let Some(index) = self.node_index.get(&id).copied() {
            self.graph.nodes[index].status = status;
        }
    }

    fn push_edge(
        &mut self,
        id: String,
        source: String,
        target: String,
        specifier: String,
        is_circular: bool,
        unresolved: bool,
    ) {
        self.graph.edges.push(Edge {
            id,
            source,
            target,
            specifier,
            is_circular,
            unresolved,
        });
    }

    fn push_issue(&mut self, file: &Path, kind: GraphIssueKind, message: String) {
        self.issue_counter += 1;
        self.graph.issues.push(GraphIssue {
            id: format!("issue-{}", self.issue_counter),
            file: stable_path_string(file),
            kind,
            message,
        });
    }
}
