import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { SessionManager } from "./session-manager.js";

// ---------------------------------------------------------------------------
// Guide content (formerly skills/napkin/SKILL.md)
// ---------------------------------------------------------------------------

const NAPKIN_GUIDE = `# Napkin — Collaborative System Design

You have access to Napkin, a tool that lets you and the user collaborate on system architecture diagrams in real time. The user draws in Excalidraw on one side of their screen while chatting with you on the other.

## How It Works

1. **Start Napkin** — call \`napkin_start\` to boot a session (returns a URL and session name)
2. **Share the URL** — give the user the URL to open in their browser
3. **Read designs** — when the user pushes a design, call \`napkin_read_design\` with the session name
4. **Write designs** — to suggest changes, call \`napkin_write_design\` with session name and valid Mermaid flowchart syntax
5. **Review history** — use \`napkin_get_history\` and \`napkin_rollback\` to navigate versions
6. **List sessions** — use \`napkin_list_sessions\` to see all active sessions

## Sessions

Every \`napkin_start\` call creates (or returns) a named session. All other tools require the \`session\` parameter.

- \`napkin_start { session?: "my-name" }\` — creates a new session (auto-named if omitted), returns \`{ url, session }\`
- \`napkin_stop { session?: "my-name" }\` — stops one session, or all sessions if omitted
- \`napkin_read_design { session: "my-name" }\` — reads from a specific session
- \`napkin_write_design { session: "my-name", mermaid: "..." }\` — writes to a specific session
- \`napkin_get_history { session: "my-name", limit?: 10 }\` — history for a session
- \`napkin_rollback { session: "my-name", timestamp: "..." }\` — rollback a session
- \`napkin_list_sessions\` — returns all active sessions with URLs

## Rules

- Do NOT call \`napkin_start\` proactively. Only start it when the user asks to sketch or design.
- When writing mermaid, always use \`flowchart TD\` (or \`LR\`) syntax. Other diagram types are not supported for round-tripping.
- Reference specific nodes and edges by their mermaid IDs when discussing the design.
- If \`napkin_read_design\` returns \`selectedElements\`, the user may be pointing at those elements — use as a context signal but prefer highlighting (below) for visual emphasis.
- Keep mermaid diagrams clean and readable. Use descriptive node labels.
- Always pass the \`session\` name returned by \`napkin_start\` to subsequent tool calls.

## Highlighting Nodes

Use mermaid \`style\` directives to highlight nodes. The \`fill\` and \`stroke\` colors render as \`backgroundColor\` and \`strokeColor\` in Excalidraw.

| Purpose | Directive | Color |
|---------|-----------|-------|
| Topic of discussion | \`style NODE fill:#d0ebff,stroke:#1971c2\` | Blue |
| New or changed nodes | \`style NODE fill:#fff3bf,stroke:#fab005\` | Yellow |
| Problem nodes | \`style NODE fill:#ffe0e0,stroke:#e03131\` | Red |
| Approved / good nodes | \`style NODE fill:#d3f9d8,stroke:#2f9e44\` | Green |

Apply highlighting when writing designs to draw the user's attention to what changed, what needs fixing, or what looks good. You can highlight multiple nodes with separate \`style\` lines.

## Example Mermaid

\\\`\\\`\\\`mermaid
flowchart TD
    API[API Gateway]
    AUTH[Auth Service]
    DB[(Database)]
    QUEUE[Message Queue]
    WORKER[Worker Service]

    API --> AUTH
    API --> QUEUE
    QUEUE --> WORKER
    WORKER --> DB
    AUTH --> DB

    style WORKER fill:#fff3bf,stroke:#fab005
\\\`\\\`\\\`

## Workflow Pattern

1. User: "Let's sketch out the architecture"
2. You: call \`napkin_start\`, note the session name, share the URL
3. User draws initial design, clicks "Push to Claude"
4. You: call \`napkin_read_design { session }\`, analyze the design, discuss
5. You suggest improvements: call \`napkin_write_design { session, mermaid }\` — user sees updates on "Claude's Revision" tab
6. User refines, pushes again. Iterate.

## Multi-Session Workflow

You can run multiple sessions simultaneously for comparing designs:

1. \`napkin_start { session: "current" }\` — current architecture
2. \`napkin_start { session: "proposed" }\` — proposed architecture
3. User draws in both, you read/write to each independently
4. \`napkin_list_sessions\` to see all active sessions
5. \`napkin_stop\` (no session) to clean up all sessions when done`;

// ---------------------------------------------------------------------------
// MCP server wiring
// ---------------------------------------------------------------------------

export function createMcpServer(sessionManager: SessionManager): McpServer {
  const server = new McpServer({
    name: "napkin",
    version: "0.2.0",
  });

  // ---------------------------------------------------------------------------
  // napkin_guide — full usage guide (replaces skills/napkin/SKILL.md)
  // ---------------------------------------------------------------------------

  server.registerPrompt("napkin_guide", {
    title: "Napkin Usage Guide",
    description: "Detailed usage guide for Napkin collaborative design tools — workflow, highlighting, rules, and examples.",
  }, async () => ({
    messages: [{
      role: "user" as const,
      content: {
        type: "text" as const,
        text: NAPKIN_GUIDE,
      },
    }],
  }));

  // napkin_start — creates/returns a session with its HTTP server
  server.tool(
    "napkin_start",
    "Start a Napkin collaborative design session. Returns { url, session }. Use the napkin_guide prompt for workflow instructions and highlighting conventions.",
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
    "Stop a Napkin session (by name) or all sessions (omit session). Cleans up server resources.",
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
    "Read the current design from a Napkin session as { mermaid, selectedElements, nodeCount, edgeCount }. selectedElements indicates what the user is pointing at.",
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
    "Write a Mermaid diagram to a Napkin session. Supported types: flowchart/graph, sequenceDiagram, classDiagram. Use style directives for node highlighting (see napkin_guide prompt).",
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
    "Get timestamped design snapshots for a Napkin session. Each entry includes source (user/claude) and mermaid content.",
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
    "Rollback to a previous design by timestamp. Get timestamps from napkin_get_history.",
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
    "List all active Napkin sessions with their URLs.",
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
