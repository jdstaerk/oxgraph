mod calls;
mod modules;
mod nodes;

use super::internal_model::{AnalysisIssue, FileAnalysis, ImportBinding};
use super::model::CallGraphIssueKind;
use crate::path_utils::{InternalAliasPattern, stable_path_string};
use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_resolver::Resolver;
use oxc_semantic::{Semantic, SemanticBuilder};
use oxc_span::SourceType;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

pub(super) fn analyze_file(
    file_path: &Path,
    resolver: &Resolver,
    project_root: &Path,
    internal_aliases: &[InternalAliasPattern],
) -> FileAnalysis {
    let mut analysis = FileAnalysis::new();
    let source_text = match fs::read_to_string(file_path) {
        Ok(source_text) => source_text,
        Err(err) => {
            analysis.issues.push(AnalysisIssue {
                file: stable_path_string(file_path),
                kind: CallGraphIssueKind::ReadError,
                message: err.to_string(),
            });
            return analysis;
        }
    };

    let allocator = Allocator::default();
    let source_type = SourceType::from_path(file_path).unwrap_or_default();
    let parse_result = Parser::new(&allocator, &source_text, source_type).parse();

    if !parse_result.errors.is_empty() {
        analysis.issues.push(AnalysisIssue {
            file: stable_path_string(file_path),
            kind: CallGraphIssueKind::ParseError,
            message: parse_result
                .errors
                .iter()
                .map(|error| format!("{:?}", error))
                .collect::<Vec<_>>()
                .join("\n"),
        });
        return analysis;
    }

    let semantic_return = SemanticBuilder::new()
        .with_check_syntax_error(true)
        .build(&parse_result.program);
    let mut analyzer = FileCallAnalyzer::new(
        file_path,
        resolver,
        project_root,
        internal_aliases,
        &semantic_return.semantic,
    );

    for error in semantic_return.errors {
        analyzer.push_issue(CallGraphIssueKind::SemanticError, format!("{:?}", error));
    }

    analyzer.collect_functions();
    analyzer.collect_imports();
    analyzer.collect_exports();
    analyzer.collect_calls();
    analyzer.finish()
}

struct FileCallAnalyzer<'a> {
    file_path: &'a Path,
    file: String,
    resolver: &'a Resolver,
    project_root: &'a Path,
    internal_aliases: &'a [InternalAliasPattern],
    semantic: &'a Semantic<'a>,
    analysis: FileAnalysis,
    function_node_to_call_node: HashMap<usize, String>,
    symbol_to_call_node: HashMap<usize, String>,
    name_to_call_nodes: HashMap<String, Vec<String>>,
    method_name_to_call_nodes: HashMap<String, Vec<String>>,
    imports_by_symbol: HashMap<usize, ImportBinding>,
    namespace_imports_by_symbol: HashMap<usize, PathBuf>,
    dependency_index: HashSet<PathBuf>,
}

impl<'a> FileCallAnalyzer<'a> {
    fn new(
        file_path: &'a Path,
        resolver: &'a Resolver,
        project_root: &'a Path,
        internal_aliases: &'a [InternalAliasPattern],
        semantic: &'a Semantic<'a>,
    ) -> Self {
        Self {
            file_path,
            file: stable_path_string(file_path),
            resolver,
            project_root,
            internal_aliases,
            semantic,
            analysis: FileAnalysis::new(),
            function_node_to_call_node: HashMap::new(),
            symbol_to_call_node: HashMap::new(),
            name_to_call_nodes: HashMap::new(),
            method_name_to_call_nodes: HashMap::new(),
            imports_by_symbol: HashMap::new(),
            namespace_imports_by_symbol: HashMap::new(),
            dependency_index: HashSet::new(),
        }
    }

    fn finish(self) -> FileAnalysis {
        self.analysis
    }

    pub(super) fn push_issue(&mut self, kind: CallGraphIssueKind, message: String) {
        self.analysis.issues.push(AnalysisIssue {
            file: self.file.clone(),
            kind,
            message,
        });
    }
}
