use super::file_analyzer::analyze_file;
use super::filter::{filter_to_entry_neighborhood, normalize_entry_function};
use super::internal_model::{AnalysisIssue, ExportTarget, FileAnalysis, PendingCallTarget};
use super::model::{
    CallConfidence, CallEdge, CallEdgeKind, CallGraph, CallGraphIssue, CallGraphIssueKind,
};
use crate::path_utils::{
    InternalAliasPattern, internal_alias_patterns, is_project_source_file, normalize_existing_path,
};
use oxc_resolver::Resolver;
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};

pub(super) struct ProjectCallGraphBuilder {
    entry_path: PathBuf,
    project_root: PathBuf,
    internal_aliases: Vec<InternalAliasPattern>,
    resolver: Resolver,
    analyses: HashMap<PathBuf, FileAnalysis>,
    issue_counter: usize,
}

impl ProjectCallGraphBuilder {
    pub(super) fn new(entry_path: PathBuf, project_root: PathBuf, resolver: Resolver) -> Self {
        let internal_aliases = internal_alias_patterns(&project_root);

        Self {
            entry_path,
            project_root,
            internal_aliases,
            resolver,
            analyses: HashMap::new(),
            issue_counter: 0,
        }
    }

    pub(super) fn analyze_reachable_files(&mut self) {
        let mut queue = VecDeque::from([self.entry_path.clone()]);
        let mut queued = HashSet::new();

        while let Some(file_path) = queue.pop_front() {
            let normalized = normalize_existing_path(&file_path).unwrap_or(file_path);
            if self.analyses.contains_key(&normalized) || !queued.insert(normalized.clone()) {
                continue;
            }

            if !is_project_source_file(&normalized, &self.project_root) {
                continue;
            }

            let analysis = analyze_file(
                &normalized,
                &self.resolver,
                &self.project_root,
                &self.internal_aliases,
            );
            for dependency in &analysis.dependencies {
                if self.should_analyze_dependency(dependency) {
                    queue.push_back(dependency.clone());
                }
            }
            self.analyses.insert(normalized, analysis);
        }
    }

    pub(super) fn finish(mut self, entry_function: Option<&str>) -> CallGraph {
        let mut graph = CallGraph::default();
        let mut node_index = HashSet::new();
        let mut edge_index = HashSet::new();

        let issues: Vec<AnalysisIssue> = self
            .analyses
            .values()
            .flat_map(|analysis| analysis.issues.iter().cloned())
            .collect();
        for issue in issues {
            self.push_issue(&mut graph, issue.file, issue.kind, issue.message);
        }

        for analysis in self.analyses.values() {
            for node in &analysis.nodes {
                if node_index.insert(node.id.clone()) {
                    graph.nodes.push(node.clone());
                }
            }
        }

        for analysis in self.analyses.values() {
            for edge in &analysis.pending_edges {
                let target_id = match &edge.target {
                    PendingCallTarget::Node(id) => Some(id.clone()),
                    PendingCallTarget::Export {
                        source_path,
                        export_name,
                    } => self.resolve_export(source_path, export_name, &mut HashSet::new()),
                };

                if let Some(target_id) = target_id {
                    push_edge(
                        &mut graph,
                        &mut edge_index,
                        EdgeInsert {
                            source: edge.source.clone(),
                            target: target_id,
                            callee_name: edge.callee_name.clone(),
                            kind: edge.kind.clone(),
                            confidence: edge.confidence.clone(),
                            unresolved: false,
                        },
                    );
                }
            }
        }

        if let Some(entry_function) = normalize_entry_function(entry_function) {
            filter_to_entry_neighborhood(&mut graph, entry_function, &mut self.issue_counter);
        }

        let mut active_nodes = HashSet::new();
        for edge in &graph.edges {
            active_nodes.insert(edge.source.clone());
            active_nodes.insert(edge.target.clone());
        }

        graph.nodes.retain(|node| node.is_entry || active_nodes.contains(&node.id));

        graph
    }

    fn should_analyze_dependency(&self, dependency: &Path) -> bool {
        is_project_source_file(dependency, &self.project_root)
    }

    fn resolve_export(
        &self,
        file_path: &Path,
        export_name: &str,
        resolution_stack: &mut HashSet<(PathBuf, String)>,
    ) -> Option<String> {
        let normalized =
            normalize_existing_path(file_path).unwrap_or_else(|_| file_path.to_path_buf());
        let key = (normalized.clone(), export_name.to_string());
        if !resolution_stack.insert(key.clone()) {
            return None;
        }

        let analysis = self.analyses.get(&normalized)?;

        if let Some(target) = analysis.exports.get(export_name) {
            let resolved = match target {
                ExportTarget::LocalNode(id) => Some(id.clone()),
                ExportTarget::ReExport {
                    source_path,
                    export_name,
                } => self.resolve_export(source_path, export_name, resolution_stack),
            };
            resolution_stack.remove(&key);
            return resolved;
        }

        if export_name == "default" {
            resolution_stack.remove(&key);
            return None;
        }

        let mut resolved_target = None;
        for source_path in &analysis.star_re_exports {
            if let Some(target_id) = self.resolve_export(source_path, export_name, resolution_stack)
            {
                if resolved_target
                    .as_ref()
                    .is_some_and(|existing| existing != &target_id)
                {
                    resolution_stack.remove(&key);
                    return None;
                }
                resolved_target = Some(target_id);
            }
        }

        resolution_stack.remove(&key);
        resolved_target
    }

    fn push_issue(
        &mut self,
        graph: &mut CallGraph,
        file: String,
        kind: CallGraphIssueKind,
        message: String,
    ) {
        self.issue_counter += 1;
        graph.issues.push(CallGraphIssue {
            id: format!("issue-{}", self.issue_counter),
            file,
            kind,
            message,
        });
    }
}

struct EdgeInsert {
    source: String,
    target: String,
    callee_name: String,
    kind: CallEdgeKind,
    confidence: CallConfidence,
    unresolved: bool,
}

fn push_edge(graph: &mut CallGraph, edge_index: &mut HashSet<String>, edge: EdgeInsert) {
    let id = format!("{}->{}::{}", edge.source, edge.target, edge.callee_name);
    if !edge_index.insert(id.clone()) {
        return;
    }

    graph.edges.push(CallEdge {
        id,
        source: edge.source,
        target: edge.target,
        callee_name: edge.callee_name,
        kind: edge.kind,
        confidence: edge.confidence,
        unresolved: edge.unresolved,
    });
}
