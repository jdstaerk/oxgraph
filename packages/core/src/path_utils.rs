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

pub(crate) fn resolve_entry_path(path: &Path) -> Result<PathBuf, EntryPathError> {
    if path.is_file() {
        return normalize_path(path);
    }

    if path.is_dir() {
        if let Some(candidate) = discover_entry_in_dir(path) {
            return normalize_path(&candidate);
        }

        return Err(EntryPathError::NotFound {
            path: path.to_path_buf(),
        });
    }

    if path.exists() {
        return normalize_path(path);
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
    let start_dir = entry_path.parent().unwrap_or(entry_path);
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

fn discover_entry_in_dir(root: &Path) -> Option<PathBuf> {
    const ROOT_ENTRY_CANDIDATES: &[&str] = &[
        "main.tsx",
        "main.ts",
        "main.jsx",
        "main.js",
        "index.tsx",
        "index.ts",
        "index.jsx",
        "index.js",
        "App.tsx",
        "App.ts",
        "App.jsx",
        "App.js",
    ];

    for candidate in ROOT_ENTRY_CANDIDATES {
        let candidate_path = root.join(candidate);
        if candidate_path.is_file() {
            return Some(candidate_path);
        }
    }

    const SRC_ENTRY_CANDIDATES: &[&str] = &[
        "src/main.tsx",
        "src/main.ts",
        "src/main.jsx",
        "src/main.js",
        "src/index.tsx",
        "src/index.ts",
        "src/index.jsx",
        "src/index.js",
        "src/App.tsx",
        "src/App.ts",
        "src/App.jsx",
        "src/App.js",
    ];

    for candidate in SRC_ENTRY_CANDIDATES {
        let candidate_path = root.join(candidate);
        if candidate_path.is_file() {
            return Some(candidate_path);
        }
    }

    None
}
