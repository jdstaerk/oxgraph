use crate::path_utils::normalize_existing_path;
use oxc_resolver::{ResolveOptions, Resolver, TsconfigDiscovery};
use std::path::{Path, PathBuf};

pub(crate) fn create_module_resolver() -> Resolver {
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
        tsconfig: Some(TsconfigDiscovery::Auto),
        ..ResolveOptions::default()
    };

    Resolver::new(options)
}

pub(crate) fn resolve_module_path(
    resolver: &Resolver,
    source_file: &Path,
    specifier: &str,
) -> Result<PathBuf, String> {
    resolver
        .resolve_file(source_file, specifier)
        .map(|resolution| {
            normalize_existing_path(resolution.full_path().as_path())
                .unwrap_or_else(|_| resolution.full_path().to_path_buf())
        })
        .map_err(|err| err.to_string())
}
