use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum InternalAliasPattern {
    Exact(String),
    Prefix(String),
}

impl InternalAliasPattern {
    pub(crate) fn matches(&self, specifier: &str) -> bool {
        match self {
            Self::Exact(alias) => specifier == alias,
            Self::Prefix(prefix) => specifier.starts_with(prefix),
        }
    }
}

#[derive(Debug)]
pub enum EntryPathError {
    NotFound { path: PathBuf },
    ReadFailed { path: PathBuf, message: String },
}

impl fmt::Display for EntryPathError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound { path } => {
                write!(f, "entry file does not exist: {}", path.display())
            }
            Self::ReadFailed { path, message } => {
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

impl std::error::Error for EntryPathError {}

pub(crate) enum AnalysisTarget {
    File(PathBuf),
    Directory(PathBuf),
}

impl AnalysisTarget {
    pub(crate) fn path(&self) -> &Path {
        match self {
            Self::File(path) | Self::Directory(path) => path,
        }
    }
}

pub(crate) fn resolve_analysis_target(path: &Path) -> Result<AnalysisTarget, EntryPathError> {
    if path.is_file() {
        return normalize_path(path).map(AnalysisTarget::File);
    }

    if path.is_dir() {
        return normalize_path(path).map(AnalysisTarget::Directory);
    }

    if path.exists() {
        return normalize_path(path).map(AnalysisTarget::File);
    }

    Err(EntryPathError::NotFound {
        path: path.to_path_buf(),
    })
}

pub(crate) fn normalize_existing_path(path: &Path) -> Result<PathBuf, String> {
    fs::canonicalize(path).map_err(|err| err.to_string())
}

pub(crate) fn stable_path_string(path: &Path) -> String {
    let raw = path.to_string_lossy();
    raw.strip_prefix(r"\\?\").unwrap_or(&raw).to_string()
}

pub(crate) fn label_from_path(path: &Path) -> String {
    path.file_name()
        .and_then(|file_name| file_name.to_str())
        .unwrap_or("")
        .to_string()
}

pub(crate) fn find_project_root(entry_path: &Path) -> PathBuf {
    let start_dir = if entry_path.is_dir() {
        entry_path
    } else {
        entry_path.parent().unwrap_or(entry_path)
    };
    let mut current = Some(start_dir);
    let mut fallback = start_dir.to_path_buf();

    while let Some(dir) = current {
        if dir.join("pnpm-workspace.yaml").exists() {
            return dir.to_path_buf();
        }
        if dir.join("package.json").exists() || dir.join("tsconfig.json").exists() {
            fallback = dir.to_path_buf();
        }
        current = dir.parent();
    }

    fallback
}

pub(crate) fn find_tsconfig(start_dir: &Path) -> Option<PathBuf> {
    let mut current = Some(start_dir);

    while let Some(dir) = current {
        let candidate = dir.join("tsconfig.json");
        if candidate.exists() {
            return Some(candidate);
        }
        current = dir.parent();
    }

    None
}

pub(crate) fn internal_alias_patterns(project_root: &Path) -> Vec<InternalAliasPattern> {
    let Some(tsconfig_path) = find_tsconfig(project_root) else {
        return Vec::new();
    };
    let Ok(tsconfig) = fs::read_to_string(tsconfig_path) else {
        return Vec::new();
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&tsconfig) else {
        return Vec::new();
    };
    let Some(paths) = json
        .get("compilerOptions")
        .and_then(|compiler_options| compiler_options.get("paths"))
        .and_then(|paths| paths.as_object())
    else {
        return Vec::new();
    };

    paths
        .keys()
        .filter_map(|key| alias_pattern_from_tsconfig_key(key))
        .collect()
}

fn alias_pattern_from_tsconfig_key(key: &str) -> Option<InternalAliasPattern> {
    if let Some((prefix, _)) = key.split_once('*') {
        if prefix.is_empty() {
            return None;
        }
        return Some(InternalAliasPattern::Prefix(prefix.to_string()));
    }

    if key.is_empty() {
        None
    } else {
        Some(InternalAliasPattern::Exact(key.to_string()))
    }
}

pub(crate) fn is_supported_source_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|extension| extension.to_str()),
        Some("ts" | "tsx" | "mts" | "cts" | "js" | "jsx" | "mjs" | "cjs")
    )
}

pub(crate) fn is_project_path(path: &Path, project_root: &Path) -> bool {
    path.starts_with(project_root) && !path_contains_segment(path, "node_modules")
}

pub(crate) fn is_project_source_file(path: &Path, project_root: &Path) -> bool {
    is_project_path(path, project_root) && is_supported_source_file(path)
}

pub(crate) fn path_contains_segment(path: &Path, segment: &str) -> bool {
    path.components()
        .any(|component| component.as_os_str().to_string_lossy() == segment)
}

pub(crate) fn collect_project_source_files(root: &Path) -> Vec<PathBuf> {
    let root = normalize_existing_path(root).unwrap_or_else(|_| root.to_path_buf());
    let mut directories = vec![root];
    let mut source_files = Vec::new();

    while let Some(directory) = directories.pop() {
        let Ok(entries) = fs::read_dir(&directory) else {
            continue;
        };

        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if path.is_dir() {
                if !is_ignored_directory(&path) {
                    directories.push(path);
                }
                continue;
            }

            if is_supported_source_file(&path)
                && let Ok(normalized) = normalize_existing_path(&path)
            {
                source_files.push(normalized);
            }
        }
    }

    source_files.sort();
    source_files
}

fn is_ignored_directory(path: &Path) -> bool {
    const IGNORED_DIRECTORIES: &[&str] = &[
        ".git",
        ".next",
        ".turbo",
        ".vercel",
        "build",
        "coverage",
        "dist",
        "node_modules",
        "out",
        "target",
    ];

    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| IGNORED_DIRECTORIES.contains(&name))
}

fn normalize_path(path: &Path) -> Result<PathBuf, EntryPathError> {
    if path.exists() {
        fs::canonicalize(path).map_err(|err| EntryPathError::ReadFailed {
            path: path.to_path_buf(),
            message: err.to_string(),
        })
    } else {
        Ok(path.to_path_buf())
    }
}
