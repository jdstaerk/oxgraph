import { Position } from 'reactflow';
import type { Edge, Node } from 'reactflow';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 50;

type RawGraphNode = Node & {
  label?: string;
  path?: string;
  kind?: string;
  status?: string;
  isEntry?: boolean;
  is_entry?: boolean;
};

function fileNameFromId(id: string) {
  return id.split(/[\\/]/).pop() || id;
}

async function layoutWithElk(elkGraph: any) {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const elk = new ELK();
  return elk.layout(elkGraph);
}

export const getLayoutedElements = async (
  nodes: RawGraphNode[],
  edges: Edge[],
) => {
  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'elk.spacing.nodeNode': '40',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      ports: [
        {
          id: `${node.id}-in`,
          layoutOptions: { 'org.eclipse.elk.port.side': 'WEST' },
        },
        {
          id: `${node.id}-out`,
          layoutOptions: { 'org.eclipse.elk.port.side': 'EAST' },
        },
      ],
      layoutOptions: {
        'org.eclipse.elk.portConstraints': 'FIXED_ORDER',
      },
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [`${edge.source}-out`],
      targets: [`${edge.target}-in`],
    })),
  };

  const layoutedGraph = await layoutWithElk(elkGraph);

  const layoutedNodes = nodes.map((node) => {
    const elkNode = layoutedGraph.children?.find((n) => n.id === node.id);
    return {
      ...node,
      type: 'custom',
      data: {
        ...node.data,
        label: node.data?.label || node.label || fileNameFromId(node.id),
        path: node.data?.path || node.path,
        kind: node.data?.kind || node.kind || node.type || 'file',
        status: node.data?.status || node.status,
        isEntry: node.data?.isEntry || node.isEntry || node.is_entry || false,
      },
      position: {
        x: elkNode?.x ?? 0,
        y: elkNode?.y ?? 0,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });

  const layoutedEdges = edges.map((edge) => ({
    ...edge,
    type: edge.type || 'smoothstep',
    sourceHandle: 'out',
    targetHandle: 'in',
    animated: false,
  }));

  return { layoutedNodes, layoutedEdges };
};
