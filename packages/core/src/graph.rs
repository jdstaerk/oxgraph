use crate::extract_imports;
use crate::module_resolver::{create_module_resolver, resolve_module_path};
use crate::path_utils::{
    EntryPathError, find_project_root, is_project_path, is_project_source_file,
    is_supported_source_file, label_from_path, normalize_existing_path, resolve_entry_path,
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
    External,
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

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
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
    let project_root = find_project_root(&entry_path);

    let resolver = create_module_resolver(&entry_path);
    let mut builder = GraphBuilder::new(resolver, project_root);
    builder.walk(&entry_path, true);
    Ok(builder.graph)
}

fn node_id_from_path(path: &Path) -> String {
    stable_path_string(path)
}

fn ghost_node_id(source: &Path, specifier: &str) -> String {
    format!("ghost:{}::{}", stable_path_string(source), specifier)
}

fn external_node_id(specifier: &str) -> String {
    format!("external:{}", specifier)
}

fn status_priority(status: &NodeStatus) -> u8 {
    match status {
        NodeStatus::Resolved => 0,
        NodeStatus::Unresolved => 1,
        NodeStatus::SyntaxError => 2,
        NodeStatus::ReadError => 3,
    }
}

fn merge_node_status(current: &NodeStatus, incoming: NodeStatus) -> NodeStatus {
    if status_priority(&incoming) >= status_priority(current) {
        incoming
    } else {
        current.clone()
    }
}

struct GraphBuilder {
    graph: Graph,
    resolver: Resolver,
    project_root: PathBuf,
    visited: HashSet<PathBuf>,
    in_progress: HashSet<PathBuf>,
    node_index: HashMap<String, usize>,
    ghost_index: HashMap<String, String>,
    edge_index: HashSet<String>,
    issue_counter: usize,
}

impl GraphBuilder {
    fn new(resolver: Resolver, project_root: PathBuf) -> Self {
        Self {
            graph: Graph::default(),
            resolver,
            project_root,
            visited: HashSet::new(),
            in_progress: HashSet::new(),
            node_index: HashMap::new(),
            ghost_index: HashMap::new(),
            edge_index: HashSet::new(),
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

        if !is_supported_source_file(&normalized) {
            self.visited.insert(normalized);
            return;
        }

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
                    if !is_project_path(&resolved_target_path, &self.project_root) {
                        let external_id = external_node_id(&specifier);
                        self.upsert_external_node(
                            &external_id,
                            &specifier,
                            &stable_path_string(&resolved_target_path),
                        );
                        self.push_edge(
                            format!("{}->{}", current_node_id, external_id),
                            current_node_id.clone(),
                            external_id,
                            specifier,
                            false,
                            false,
                        );
                        continue;
                    }

                    let target_node_id = node_id_from_path(&resolved_target_path);
                    let is_circular = self.in_progress.contains(&resolved_target_path);
                    self.push_edge(
                        format!("{}->{}", current_node_id, target_node_id),
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

                    if !is_circular
                        && !self.visited.contains(&resolved_target_path)
                        && is_project_source_file(&resolved_target_path, &self.project_root)
                    {
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
            let was_entry = node.is_entry || matches!(node.kind, NodeKind::Entry);
            node.kind = if was_entry || is_entry {
                NodeKind::Entry
            } else {
                kind
            };
            node.status = merge_node_status(&node.status, status);
            node.is_entry = was_entry || is_entry;
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

    fn upsert_external_node(&mut self, external_id: &str, label: &str, resolved_path: &str) {
        if let Some(index) = self.node_index.get(external_id).copied() {
            let node = &mut self.graph.nodes[index];
            node.kind = NodeKind::External;
            node.status = NodeStatus::Resolved;
            node.is_entry = false;
            node.label = label.to_string();
            node.path = resolved_path.to_string();
            return;
        }

        let index = self.graph.nodes.len();
        self.graph.nodes.push(Node {
            id: external_id.to_string(),
            label: label.to_string(),
            path: resolved_path.to_string(),
            kind: NodeKind::External,
            status: NodeStatus::Resolved,
            is_entry: false,
        });
        self.node_index.insert(external_id.to_string(), index);
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
        if !self.edge_index.insert(id.clone()) {
            return;
        }

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn create_test_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("oxgraph-graph-{}-{}", name, nanos));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn keeps_external_packages_as_leaf_nodes() {
        let dir = create_test_dir("external-leaf");
        fs::write(dir.join("package.json"), "{}").unwrap();
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::create_dir_all(dir.join("node_modules/external-pkg")).unwrap();
        fs::write(
            dir.join("src/main.ts"),
            "import { local } from './local';\nimport external from 'external-pkg';\nlocal();\nexternal();\n",
        )
        .unwrap();
        fs::write(dir.join("src/local.ts"), "export function local() {}\n").unwrap();
        fs::write(
            dir.join("node_modules/external-pkg/package.json"),
            r#"{"main":"index.js"}"#,
        )
        .unwrap();
        fs::write(
            dir.join("node_modules/external-pkg/index.js"),
            "export default 1;\n",
        )
        .unwrap();

        let graph = build_graph(dir.join("src/main.ts")).unwrap();

        assert!(graph.nodes.iter().any(|node| {
            node.label == "external-pkg"
                && node.kind == NodeKind::External
                && node.status == NodeStatus::Resolved
        }));
        assert!(graph.nodes.iter().any(|node| node.label == "local.ts"));
        assert!(graph.issues.is_empty());

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn preserves_entry_metadata_when_cycle_points_back_to_entry() {
        let dir = create_test_dir("entry-cycle");
        fs::write(dir.join("package.json"), "{}").unwrap();
        fs::write(dir.join("main.ts"), "import './dep';\n").unwrap();
        fs::write(dir.join("dep.ts"), "import './main';\n").unwrap();

        let graph = build_graph(dir.join("main.ts")).unwrap();
        let entry_id = stable_path_string(&fs::canonicalize(dir.join("main.ts")).unwrap());
        let entry = graph.nodes.iter().find(|node| node.id == entry_id).unwrap();

        assert_eq!(entry.kind, NodeKind::Entry);
        assert!(entry.is_entry);
        assert!(graph.edges.iter().any(|edge| edge.is_circular));

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn dedupes_repeated_edges_between_the_same_files() {
        let dir = create_test_dir("dedupe-edges");
        fs::write(dir.join("package.json"), "{}").unwrap();
        fs::write(
            dir.join("main.ts"),
            "import { a } from './util';\nimport { b } from './util';\na();\nb();\n",
        )
        .unwrap();
        fs::write(
            dir.join("util.ts"),
            "export function a() {}\nexport function b() {}\n",
        )
        .unwrap();

        let graph = build_graph(dir.join("main.ts")).unwrap();
        let main_id = stable_path_string(&fs::canonicalize(dir.join("main.ts")).unwrap());
        let util_id = stable_path_string(&fs::canonicalize(dir.join("util.ts")).unwrap());
        let repeated_edges = graph
            .edges
            .iter()
            .filter(|edge| edge.source == main_id && edge.target == util_id)
            .count();

        assert_eq!(repeated_edges, 1);

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn does_not_parse_unsupported_project_files() {
        let dir = create_test_dir("unsupported-leaf");
        fs::write(dir.join("package.json"), "{}").unwrap();
        fs::write(dir.join("main.ts"), "import data from './data.json';\n").unwrap();
        fs::write(
            dir.join("data.json"),
            "{ invalid json is still not javascript",
        )
        .unwrap();

        let graph = build_graph(dir.join("main.ts")).unwrap();

        assert!(graph.nodes.iter().any(|node| node.label == "data.json"));
        assert!(
            graph
                .issues
                .iter()
                .all(|issue| issue.kind != GraphIssueKind::ParseError)
        );

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn keeps_parse_error_status_when_file_is_referenced_again() {
        let dir = create_test_dir("sticky-parse-error");
        fs::write(dir.join("package.json"), "{}").unwrap();
        fs::write(dir.join("main.ts"), "import './bad';\nimport './other';\n").unwrap();
        fs::write(dir.join("other.ts"), "import './bad';\n").unwrap();
        fs::write(dir.join("bad.ts"), "export function broken( {\n").unwrap();

        let graph = build_graph(dir.join("main.ts")).unwrap();
        let bad_id = stable_path_string(&fs::canonicalize(dir.join("bad.ts")).unwrap());
        let bad_node = graph.nodes.iter().find(|node| node.id == bad_id).unwrap();

        assert_eq!(bad_node.status, NodeStatus::SyntaxError);
        assert!(
            graph
                .issues
                .iter()
                .any(|issue| issue.kind == GraphIssueKind::ParseError)
        );

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn discovers_jsx_entry_when_directory_is_passed() {
        let dir = create_test_dir("jsx-entry");
        fs::write(dir.join("package.json"), "{}").unwrap();
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::write(dir.join("src/main.jsx"), "import './view';\n").unwrap();
        fs::write(dir.join("src/view.jsx"), "export function View() {}\n").unwrap();

        let graph = build_graph(&dir).unwrap();

        assert!(graph.nodes.iter().any(|node| {
            node.label == "main.jsx" && node.kind == NodeKind::Entry && node.is_entry
        }));
        assert!(graph.nodes.iter().any(|node| node.label == "view.jsx"));

        fs::remove_dir_all(dir).ok();
    }
}
