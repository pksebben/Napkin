import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { StateStore } from "./state.js";
import { validateMermaid } from "./validator.js";
import type {
  ReadDesignResult,
  WriteDesignResult,
  DesignSnapshot,
} from "../shared/types.js";

// ---------------------------------------------------------------------------
// Pure handler functions (testable independently)
// ---------------------------------------------------------------------------

export async function handleReadDesign(
  store: StateStore
): Promise<ReadDesignResult> {
  return {
    mermaid: store.getCurrentDesign(),
    selectedElements: store.getSelectedElements(),
    nodeCount: store.getNodeCount(),
    edgeCount: store.getEdgeCount(),
  };
}

export async function handleWriteDesign(
  store: StateStore,
  mermaid: string,
  broadcast: (mermaid: string) => void
): Promise<WriteDesignResult> {
  const validation = await validateMermaid(mermaid);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }
  store.setDesign(mermaid, "claude");
  broadcast(mermaid);
  return { success: true };
}

export function handleGetHistory(
  store: StateStore,
  limit: number
): DesignSnapshot[] {
  return store.getHistory(limit);
}

export function handleRollback(store: StateStore, timestamp: string): void {
  store.rollback(timestamp);
}

// ---------------------------------------------------------------------------
// MCP server wiring
// ---------------------------------------------------------------------------

export function createMcpServer(
  store: StateStore,
  startHttpServer: () => Promise<string>,
  stopHttpServer: () => Promise<void>,
  broadcastDesign: (mermaid: string) => void
): McpServer {
  const server = new McpServer({
    name: "napkin",
    version: "0.1.0",
  });

  // napkin_start — launches the HTTP/WebSocket server, returns the URL
  server.tool("napkin_start", "Start the Napkin HTTP server", async () => {
    const url = await startHttpServer();
    return {
      content: [{ type: "text", text: JSON.stringify({ url }) }],
    };
  });

  // napkin_stop — stops the HTTP/WebSocket server
  server.tool("napkin_stop", "Stop the Napkin HTTP server", async () => {
    await stopHttpServer();
    return {
      content: [{ type: "text", text: JSON.stringify({ stopped: true }) }],
    };
  });

  // napkin_read_design — returns current design state
  server.tool(
    "napkin_read_design",
    "Read the current design from Napkin",
    async () => {
      const result = await handleReadDesign(store);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }
  );

  // napkin_write_design — validates and stores a mermaid diagram
  server.tool(
    "napkin_write_design",
    "Write a mermaid diagram to Napkin",
    { mermaid: z.string() },
    async ({ mermaid }) => {
      const result = await handleWriteDesign(store, mermaid, broadcastDesign);
      if (!result.success) {
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }
  );

  // napkin_get_history — returns design history
  server.tool(
    "napkin_get_history",
    "Get design history from Napkin",
    { limit: z.number().optional().default(10) },
    async ({ limit }) => {
      const history = handleGetHistory(store, limit);
      return {
        content: [{ type: "text", text: JSON.stringify(history) }],
      };
    }
  );

  // napkin_rollback — restores a previous design by timestamp
  server.tool(
    "napkin_rollback",
    "Rollback to a previous design in Napkin",
    { timestamp: z.string() },
    async ({ timestamp }) => {
      try {
        handleRollback(store, timestamp);
        return {
          content: [
            { type: "text", text: JSON.stringify({ success: true }) },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : "Unknown error",
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// Start the MCP server on stdio
// ---------------------------------------------------------------------------

export async function startMcpServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
