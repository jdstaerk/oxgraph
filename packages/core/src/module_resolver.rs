use crate::path_utils::normalize_existing_path;
use oxc_resolver::{ResolveOptions, Resolver, TsconfigDiscovery, TsconfigOptions};
use std::path::{Path, PathBuf};

pub(crate) fn create_module_resolver(entry_path: &Path) -> Resolver {
    let entry_dir = entry_path.parent().unwrap_or(entry_path);
    let tsconfig = find_tsconfig(entry_dir);

    let options = ResolveOptions {
        extensions: vec![
            ".ts".to_string(),
            ".tsx".to_string(),
            ".mts".to_string(),
            ".cts".to_string(),
            ".js".to_string(),
            ".jsx".to_string(),
            ".mjs".to_string(),
            ".cjs".to_string(),
            ".json".to_string(),
        ],
        tsconfig: tsconfig.map(|path| {
            TsconfigDiscovery::Manual(TsconfigOptions {
                config_file: path,
                references: oxc_resolver::TsconfigReferences::Auto,
            })
        }),
        ..ResolveOptions::default()
    };

    Resolver::new(options)
}

pub(crate) fn resolve_module_path(
    resolver: &Resolver,
    source_file: &Path,
    specifier: &str,
) -> Result<PathBuf, String> {
    let source_dir = source_file.parent().unwrap_or(source_file);
    resolver
        .resolve(source_dir, specifier)
        .map(|resolution| {
            normalize_existing_path(resolution.full_path().as_path())
                .unwrap_or_else(|_| resolution.full_path().to_path_buf())
        })
        .map_err(|err| err.to_string())
}

fn find_tsconfig(start_dir: &Path) -> Option<PathBuf> {
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
