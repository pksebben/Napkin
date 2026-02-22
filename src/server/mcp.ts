import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { SessionManager } from "./session-manager.js";

// ---------------------------------------------------------------------------
// MCP server wiring
// ---------------------------------------------------------------------------

export function createMcpServer(sessionManager: SessionManager): McpServer {
  const server = new McpServer({
    name: "napkin",
    version: "0.2.0",
  });

  // napkin_start — creates/returns a session with its HTTP server
  server.tool(
    "napkin_start",
    "Start the Napkin HTTP server",
    { session: z.string().optional() },
    async ({ session: name }) => {
      const info = await sessionManager.createSession(name ?? undefined);
      return {
        content: [{ type: "text", text: JSON.stringify({ url: info.url, session: info.name }) }],
      };
    }
  );

  // napkin_stop — stops one session or all sessions
  server.tool(
    "napkin_stop",
    "Stop the Napkin HTTP server",
    { session: z.string().optional() },
    async ({ session: name }) => {
      if (name) {
        await sessionManager.destroySession(name);
      } else {
        await sessionManager.destroyAll();
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ stopped: true }) }],
      };
    }
  );

  // napkin_read_design — returns current design state for a session
  server.tool(
    "napkin_read_design",
    "Read the current design from Napkin",
    { session: z.string() },
    async ({ session: name }) => {
      const result = await sessionManager.readDesign(name);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }
  );

  // napkin_write_design — validates and stores a mermaid diagram
  server.tool(
    "napkin_write_design",
    "Write a mermaid diagram to Napkin. Supported types: flowchart/graph, sequenceDiagram, classDiagram. Other types (erDiagram, stateDiagram, etc.) will be rejected — use a flowchart instead.",
    { session: z.string(), mermaid: z.string() },
    async ({ session: name, mermaid }) => {
      const result = await sessionManager.writeDesign(name, mermaid);
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

  // napkin_get_history — returns design history for a session
  server.tool(
    "napkin_get_history",
    "Get design history from Napkin",
    { session: z.string(), limit: z.number().optional().default(10) },
    async ({ session: name, limit }) => {
      const history = await sessionManager.getHistory(name, limit);
      return {
        content: [{ type: "text", text: JSON.stringify(history) }],
      };
    }
  );

  // napkin_rollback — restores a previous design by timestamp
  server.tool(
    "napkin_rollback",
    "Rollback to a previous design in Napkin",
    { session: z.string(), timestamp: z.string() },
    async ({ session: name, timestamp }) => {
      const result = await sessionManager.rollback(name, timestamp);
      if (!result.success) {
        return {
          content: [
            { type: "text", text: JSON.stringify(result) },
          ],
          isError: true,
        };
      }
      return {
        content: [
          { type: "text", text: JSON.stringify({ success: true }) },
        ],
      };
    }
  );

  // napkin_list_sessions — returns all active sessions
  server.tool(
    "napkin_list_sessions",
    "List all active Napkin sessions",
    async () => {
      const sessions = await sessionManager.listSessions();
      return {
        content: [{ type: "text", text: JSON.stringify(sessions) }],
      };
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
