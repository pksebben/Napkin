declare module "excalidraw-to-mermaid" {
  interface ConvertResult {
    mermaid: string;
    nodeCount: number;
    edgeCount: number;
    direction: string;
  }

  interface ConvertOptions {
    direction?: "TD" | "LR" | "BT" | "RL";
  }

  interface GraphNode {
    id: string;
    label: string;
    shape: string;
    x: number;
    y: number;
    width: number;
    height: number;
    strokeStyle: string;
    strokeColor: string;
    backgroundColor: string;
    groupIds: string[];
  }

  interface GraphEdge {
    id: string;
    source: string;
    target: string;
    label: string;
    style: string;
  }

  interface ParsedGraph {
    nodes: Map<string, GraphNode>;
    edges: GraphEdge[];
    groups: Map<string, { id: string; label: string; members: string[] }>;
    direction: string;
  }

  export function convert(doc: unknown, options?: ConvertOptions): ConvertResult;
  export function convertFile(path: string, options?: ConvertOptions): ConvertResult;
  export function parseDocument(doc: unknown): ParsedGraph;
  export function toMermaid(graph: ParsedGraph, options?: ConvertOptions): string;
}
