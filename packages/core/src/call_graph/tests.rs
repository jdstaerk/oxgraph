use super::*;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn create_test_dir(name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("oxgraph-{}-{}", name, nanos));
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn resolves_named_import_call_across_modules() {
    let dir = create_test_dir("named-import");
    fs::write(
        dir.join("main.ts"),
        "import { helper } from './util';\nfunction start() { helper(); }\n",
    )
    .unwrap();
    fs::write(
        dir.join("util.ts"),
        "export function helper() { return 1; }\n",
    )
    .unwrap();

    let graph = build_call_graph(dir.join("main.ts"), Some("start")).unwrap();

    assert!(graph.nodes.iter().any(|node| node.name == "start"));
    assert!(graph.nodes.iter().any(|node| node.name == "helper"));
    assert!(graph.edges.iter().any(|edge| {
        edge.callee_name == "helper"
            && edge.kind == CallEdgeKind::Import
            && edge.confidence == CallConfidence::High
            && !edge.unresolved
    }));

    fs::remove_dir_all(dir).ok();
}

#[test]
fn resolves_barrel_re_export_call_across_modules() {
    let dir = create_test_dir("barrel-re-export");
    fs::write(
        dir.join("main.ts"),
        "import { helper } from './index';\nfunction start() { helper(); }\n",
    )
    .unwrap();
    fs::write(dir.join("index.ts"), "export { helper } from './util';\n").unwrap();
    fs::write(
        dir.join("util.ts"),
        "export function helper() { return 1; }\n",
    )
    .unwrap();

    let graph = build_call_graph(dir.join("main.ts"), Some("start")).unwrap();

    assert!(graph.nodes.iter().any(|node| node.name == "start"));
    assert!(graph.nodes.iter().any(|node| node.name == "helper"));
    assert!(graph.edges.iter().any(|edge| {
        edge.callee_name == "helper"
            && edge.kind == CallEdgeKind::Import
            && edge.confidence == CallConfidence::High
            && !edge.unresolved
    }));

    fs::remove_dir_all(dir).ok();
}

#[test]
fn discards_external_imports_and_unresolved_native_calls() {
    let dir = create_test_dir("domain-only");
    fs::write(
        dir.join("main.ts"),
        r#"
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { helper } from './util';

function start(items: string[]) {
  useState();
  useEffect(() => {});
  items.map((item) => item.trim());
  console.log('debug');
  missingGlobal();
  createClient();
  helper();
}
"#,
    )
    .unwrap();
    fs::write(
        dir.join("util.ts"),
        "export function helper() { return 1; }\n",
    )
    .unwrap();

    let graph = build_call_graph(dir.join("main.ts"), Some("start")).unwrap();

    assert!(graph.nodes.iter().any(|node| node.name == "start"));
    assert!(graph.nodes.iter().any(|node| node.name == "helper"));
    assert!(graph.nodes.iter().all(|node| {
        !matches!(node.kind, CallNodeKind::Unresolved)
            && !matches!(
                node.name.as_str(),
                "useState"
                    | "useEffect"
                    | "createClient"
                    | "map"
                    | "trim"
                    | "log"
                    | "missingGlobal"
            )
    }));
    assert_eq!(graph.edges.len(), 1);
    assert_eq!(graph.edges[0].callee_name, "helper");
    assert_eq!(graph.edges[0].kind, CallEdgeKind::Import);
    assert!(!graph.edges[0].unresolved);
    assert!(
        graph
            .issues
            .iter()
            .all(|issue| issue.kind != CallGraphIssueKind::ResolveError)
    );

    fs::remove_dir_all(dir).ok();
}

#[test]
fn reports_unresolved_configured_internal_alias_imports() {
    let dir = create_test_dir("missing-internal-alias");
    fs::write(dir.join("package.json"), "{}").unwrap();
    fs::write(
        dir.join("tsconfig.json"),
        r#"{"compilerOptions":{"baseUrl":".","paths":{"@app/*":["src/*"]}}}"#,
    )
    .unwrap();
    fs::create_dir_all(dir.join("src")).unwrap();
    fs::write(
        dir.join("src/main.ts"),
        "import { helper } from '@app/missing';\nfunction start() { helper(); }\n",
    )
    .unwrap();

    let graph = build_call_graph(dir.join("src/main.ts"), Some("start")).unwrap();

    assert!(graph.issues.iter().any(|issue| {
        issue.kind == CallGraphIssueKind::ResolveError && issue.message.contains("@app/missing")
    }));

    fs::remove_dir_all(dir).ok();
}

#[test]
fn keeps_same_file_calls_and_unique_local_methods() {
    let dir = create_test_dir("local-methods");
    fs::write(
        dir.join("main.ts"),
        r#"
class Service {
  save() {}
}

function helper() {}

function start(service: Service) {
  helper();
  service.save();
  ['a'].filter(Boolean);
}
"#,
    )
    .unwrap();

    let graph = build_call_graph(dir.join("main.ts"), Some("start")).unwrap();
    let callees: HashSet<&str> = graph
        .edges
        .iter()
        .map(|edge| edge.callee_name.as_str())
        .collect();

    assert!(callees.contains("helper"));
    assert!(callees.contains("save"));
    assert!(!callees.contains("filter"));
    assert!(graph.edges.iter().all(|edge| !edge.unresolved));

    fs::remove_dir_all(dir).ok();
}

#[test]
fn resolves_tsconfig_alias_imports_after_path_resolution() {
    let dir = create_test_dir("tsconfig-alias");
    fs::write(dir.join("package.json"), "{}").unwrap();
    fs::write(
        dir.join("tsconfig.json"),
        r#"{"compilerOptions":{"baseUrl":".","paths":{"@app/*":["src/*"]}}}"#,
    )
    .unwrap();
    fs::create_dir_all(dir.join("src")).unwrap();
    fs::write(
        dir.join("src/main.ts"),
        "import { helper } from '@app/util';\nfunction start() { helper(); }\n",
    )
    .unwrap();
    fs::write(
        dir.join("src/util.ts"),
        "export function helper() { return 1; }\n",
    )
    .unwrap();

    let graph = build_call_graph(dir.join("src/main.ts"), Some("start")).unwrap();

    assert!(graph.nodes.iter().any(|node| node.name == "start"));
    assert!(graph.nodes.iter().any(|node| node.name == "helper"));
    assert!(graph.edges.iter().any(|edge| {
        edge.callee_name == "helper"
            && edge.kind == CallEdgeKind::Import
            && edge.confidence == CallConfidence::High
            && !edge.unresolved
    }));

    fs::remove_dir_all(dir).ok();
}

#[test]
fn filters_entry_function_to_full_caller_and_callee_lines() {
    let dir = create_test_dir("recursive-entry-filter");
    fs::write(
        dir.join("main.ts"),
        r#"
function top() { middle(); }
function middle() { start(); }
function start() { leaf(); }
function leaf() { end(); }
function end() {}
function sibling() {}
"#,
    )
    .unwrap();

    let graph = build_call_graph(dir.join("main.ts"), Some("start")).unwrap();
    let names: HashSet<&str> = graph.nodes.iter().map(|node| node.name.as_str()).collect();
    let edges: HashSet<&str> = graph
        .edges
        .iter()
        .map(|edge| edge.callee_name.as_str())
        .collect();

    assert!(names.contains("top"));
    assert!(names.contains("middle"));
    assert!(names.contains("start"));
    assert!(names.contains("leaf"));
    assert!(names.contains("end"));
    assert!(!names.contains("sibling"));
    assert!(edges.contains("middle"));
    assert!(edges.contains("start"));
    assert!(edges.contains("leaf"));
    assert!(edges.contains("end"));

    fs::remove_dir_all(dir).ok();
}
