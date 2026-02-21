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

  export function convert(doc: unknown, options?: ConvertOptions): ConvertResult;
  export function convertFile(path: string, options?: ConvertOptions): ConvertResult;
}
