import { useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
} from "reactflow";
import "reactflow/dist/style.css";

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    // Hier holt sich das UI die JSON-Daten von der CLI
    fetch("/api/graph-data")
      .then((res) => {
        if (!res.ok)
          throw new Error("Netzwerk-Fehler beim Laden der Graph-Daten");
        return res.json();
      })
      .then((data) => {
        // React Flow mit den aus Rust stammenden Daten füttern
        setNodes(data.nodes || []);
        setEdges(data.edges || []);
      })
      .catch((err) => console.error(err));
  }, [setNodes, setEdges]);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0f172a" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        proOptions={{ hideAttribution: true }} // Versteckt das kleine React Flow Logo unten rechts
      >
        <Background color="#334155" gap={16} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
