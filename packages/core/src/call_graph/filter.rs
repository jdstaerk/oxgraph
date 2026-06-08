use super::model::{CallGraph, CallGraphIssue, CallGraphIssueKind};
use std::collections::{HashSet, VecDeque};

pub(super) fn filter_to_entry_neighborhood(
    graph: &mut CallGraph,
    entry_function: &str,
    issue_counter: &mut usize,
) {
    let entry_ids: HashSet<String> = graph
        .nodes
        .iter()
        .filter(|node| normalize_function_name(&node.name) == entry_function)
        .map(|node| node.id.clone())
        .collect();

    if entry_ids.is_empty() {
        *issue_counter += 1;
        graph.issues.push(CallGraphIssue {
            id: format!("issue-{}", issue_counter),
            file: String::new(),
            kind: CallGraphIssueKind::EntryFunctionNotFound,
            message: format!("entry function `{}` was not found", entry_function),
        });
        return;
    }

    for node in &mut graph.nodes {
        node.is_entry = entry_ids.contains(&node.id);
    }

    let mut visible_node_ids = entry_ids.clone();
    let mut outgoing_visited = entry_ids.clone();
    let mut incoming_visited = entry_ids.clone();
    let mut outgoing_queue: VecDeque<String> = entry_ids.iter().cloned().collect();
    let mut incoming_queue: VecDeque<String> = entry_ids.iter().cloned().collect();

    while let Some(current_id) = outgoing_queue.pop_front() {
        for edge in &graph.edges {
            if edge.source != current_id || !outgoing_visited.insert(edge.target.clone()) {
                continue;
            }

            visible_node_ids.insert(edge.target.clone());
            outgoing_queue.push_back(edge.target.clone());
        }
    }

    while let Some(current_id) = incoming_queue.pop_front() {
        for edge in &graph.edges {
            if edge.target != current_id || !incoming_visited.insert(edge.source.clone()) {
                continue;
            }

            visible_node_ids.insert(edge.source.clone());
            incoming_queue.push_back(edge.source.clone());
        }
    }

    graph
        .nodes
        .retain(|node| visible_node_ids.contains(&node.id));
    graph.edges.retain(|edge| {
        visible_node_ids.contains(&edge.source) && visible_node_ids.contains(&edge.target)
    });
}

pub(super) fn normalize_entry_function(entry_function: Option<&str>) -> Option<&str> {
    let entry_function = entry_function?.trim();
    if entry_function.is_empty() {
        None
    } else {
        Some(entry_function.trim_end_matches("()"))
    }
}

fn normalize_function_name(name: &str) -> &str {
    name.trim_end_matches("()")
}
