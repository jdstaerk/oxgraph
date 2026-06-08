use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

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
        "index.tsx",
        "index.ts",
        "App.tsx",
        "App.ts",
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
        "src/index.tsx",
        "src/index.ts",
        "src/App.tsx",
        "src/App.ts",
    ];

    for candidate in SRC_ENTRY_CANDIDATES {
        let candidate_path = root.join(candidate);
        if candidate_path.is_file() {
            return Some(candidate_path);
        }
    }

    None
}
