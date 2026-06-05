#![deny(clippy::all)]

pub mod visitor;

use napi_derive::napi;
// (Wenn du deine Oxc-Logik aus der vorherigen Session in einer separaten Datei hast,
// importierst du sie hier. Für das Beispiel nutze ich eine Dummy-Oxc-Funktion)

// 1. Die Datenstrukturen für React Flow
// #[napi(object)] sagt NAPI, dass dies zu einem normalen JS-Objekt {} wird.
#[napi(object)]
pub struct ReactFlowNode {
    pub id: String,
    // "type" ist in Rust ein reserviertes Wort.
    // Mit js_name sagen wir NAPI, dass es in JavaScript trotzdem { type: '...' } heißen soll.
    #[napi(js_name = "type")]
    pub node_type: String,
}

#[napi(object)]
pub struct ReactFlowEdge {
    pub id: String,
    pub source: String,
    pub target: String,
}

#[napi(object)]
pub struct GraphData {
    pub nodes: Vec<ReactFlowNode>,
    pub edges: Vec<ReactFlowEdge>,
}

// 2. Deine exportierte Hauptfunktion
// Das #[napi] Makro macht diese Funktion in Node.js via import/require verfügbar.
#[napi]
pub fn extract_graph(target_path: String) -> GraphData {
    // --- HIER RUFTST DU DEINEN OXC-PARSER UND VISITOR AUF ---
    // (Da du sagtest, du hast die Traversierung und Path-Resolution schon gelöst,
    // nimmst du hier deine Ergebnisse und mapst sie in die ReactFlow-Structs).

    // Beispiel-Mapping (ersetze das mit deinen echten Ergebnissen):
    let nodes = vec![
        ReactFlowNode {
            id: target_path.clone(),
            node_type: "default".to_string(),
        },
        ReactFlowNode {
            id: format!("{}/components/Button.tsx", target_path),
            node_type: "default".to_string(),
        },
    ];

    let edges = vec![ReactFlowEdge {
        id: format!("{}->{}/components/Button.tsx", target_path, target_path),
        source: target_path.clone(),
        target: format!("{}/components/Button.tsx", target_path),
    }];

    // Rückgabe des fertigen Graphen an Node.js
    GraphData { nodes, edges }
}
