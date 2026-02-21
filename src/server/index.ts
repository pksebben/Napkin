import { StateStore } from "./state.js";
import { createMcpServer, startMcpServer } from "./mcp.js";
import { startHttpServer, type HttpServerInstance } from "./http-server.js";
import { dehydrate } from "./dehydrator.js";

const store = new StateStore();
let httpInstance: HttpServerInstance | null = null;

function broadcastDesign(mermaid: string): void {
  httpInstance?.broadcast({ type: "design_update", mermaid });
}

function onPushDesign(elements: unknown, appState: unknown, selectedElementIds: string[]): void {
  try {
    const doc = { type: "excalidraw", version: 2, elements, appState };
    const result = dehydrate(doc);
    store.setDesign(result.mermaid, "user");
    store.setSelectedElements(selectedElementIds);
    console.error(`Design pushed: ${result.nodeCount} nodes, ${result.edgeCount} edges`);
  } catch (err) {
    console.error("Dehydration failed:", err);
  }
}

const mcpServer = createMcpServer(
  store,
  async () => {
    if (httpInstance) return httpInstance.url;
    httpInstance = await startHttpServer({ onPushDesign });
    return httpInstance.url;
  },
  async () => {
    if (httpInstance) {
      await httpInstance.close();
      httpInstance = null;
    }
  },
  broadcastDesign
);

startMcpServer(mcpServer).catch((err) => {
  console.error("MCP server failed:", err);
  process.exit(1);
});
