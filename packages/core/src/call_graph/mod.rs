use crate::module_resolver::create_module_resolver;
use crate::path_utils::{EntryPathError, find_project_root, resolve_entry_path};
use std::fmt;
use std::path::{Path, PathBuf};

mod ast_utils;
mod file_analyzer;
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
    let entry_path = resolve_entry_path(entry_file.as_ref())?;
    let project_root = find_project_root(&entry_path);
    let resolver = create_module_resolver(&entry_path);
    let mut builder = ProjectCallGraphBuilder::new(entry_path, project_root, resolver);

    builder.analyze_reachable_files();
    Ok(builder.finish(entry_function))
}
