use crate::module_resolver::create_module_resolver;
use crate::path_utils::{
    AnalysisTarget, EntryPathError, collect_project_source_files, find_project_root,
    resolve_analysis_target,
};
use std::fmt;
use std::path::{Path, PathBuf};

mod ast_utils;
mod file_analyzer;
#[cfg(test)]
pub(crate) use file_analyzer::analyze_source_text;
mod filter;
mod internal_model;
mod model;
mod project_builder;
#[cfg(test)]
mod tests;

pub use model::{
    CallConfidence, CallEdge, CallEdgeKind, CallGraph, CallGraphIssue, CallGraphIssueKind,
    CallNode, CallNodeKind, CallNodeStatus,
};
use project_builder::ProjectCallGraphBuilder;

#[derive(Debug)]
pub enum CallGraphBuildError {
    EntryNotFound { path: PathBuf },
    EntryReadFailed { path: PathBuf, message: String },
    NoSourceFiles { path: PathBuf },
}

impl fmt::Display for CallGraphBuildError {
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
            Self::NoSourceFiles { path } => {
                write!(
                    f,
                    "no supported JavaScript or TypeScript source files found under: {}",
                    path.display()
                )
            }
        }
    }
}

impl std::error::Error for CallGraphBuildError {}

impl From<EntryPathError> for CallGraphBuildError {
    fn from(error: EntryPathError) -> Self {
        match error {
            EntryPathError::NotFound { path } => Self::EntryNotFound { path },
            EntryPathError::ReadFailed { path, message } => Self::EntryReadFailed { path, message },
        }
    }
}

pub fn build_call_graph(
    entry_file: impl AsRef<Path>,
    entry_function: Option<&str>,
) -> Result<CallGraph, CallGraphBuildError> {
    let target = resolve_analysis_target(entry_file.as_ref())?;
    let project_root = find_project_root(target.path());
    let resolver = create_module_resolver(target.path());
    let initial_paths = match target {
        AnalysisTarget::File(entry_path) => vec![entry_path],
        AnalysisTarget::Directory(root_path) => {
            let source_files = collect_project_source_files(&root_path);
            if source_files.is_empty() {
                return Err(CallGraphBuildError::NoSourceFiles { path: root_path });
            }
            source_files
        }
    };
    let mut builder = ProjectCallGraphBuilder::new(initial_paths, project_root, resolver);

    builder.analyze_reachable_files();
    Ok(builder.finish(entry_function))
}
