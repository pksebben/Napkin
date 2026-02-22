# Napkin

**Collaborative system design on the back of a napkin.**

Napkin is a [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugin that opens a visual design canvas alongside your terminal. You draw architecture diagrams in [Excalidraw](https://excalidraw.com); Claude reads and writes them as [Mermaid](https://mermaid.js.org/) flowcharts. Push your drawing to Claude, Claude pushes revisions back -- a push-to-talk loop for system design.

```
 You (Excalidraw)                          Claude (Mermaid)
 ┌──────────────────┐                     ┌──────────────────┐
 │  ┌───┐   ┌───┐  │   dehydrate ──►     │ flowchart TD     │
 │  │ A ├──►│ B │  │                     │   A --> B         │
 │  └───┘   └───┘  │   ◄── hydrate       │   B --> C         │
 │          ┌───┐  │                     │   style A fill:…  │
 │          │ C │  │                     └──────────────────┘
 │          └───┘  │
 └──────────────────┘
        browser                               MCP tools
```

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI

### Install and Build

```bash
git clone https://github.com/pksebben/Napkin.git
cd Napkin
npm install
npm run build
```

### Configure Claude Code

Add the MCP server to your project's `.mcp.json` (already included in the repo):

```json
{
  "mcpServers": {
    "napkin": {
      "command": "node",
      "args": ["./dist/napkin.cjs"]
    }
  }
}
```

### Use It

In Claude Code, just say something like:

> "Let's sketch out the architecture for this system"

Claude will call `napkin_start`, hand you a URL (default `http://localhost:3210/s/<session>`), and you're off. Draw on the canvas, click **Push to Claude**, and Claude sees your diagram as Mermaid text. Claude writes back, and the canvas updates live.

---

## How It Works

### The Loop

1. **You draw** boxes and arrows on the Excalidraw canvas in your browser
2. **You push** the design to Claude (button in the UI)
3. **Claude reads** the design as a Mermaid flowchart via `napkin_read_design`
4. **Claude writes** an updated flowchart via `napkin_write_design`
5. **You see** the changes appear on the canvas in real time
6. **Repeat** -- iterate until the design is right

### Bidirectional Conversion

| Direction | Process | Library |
|-----------|---------|---------|
| Excalidraw -> Mermaid | **Dehydration** -- shapes and arrows become `flowchart TD` syntax | [excalidraw-to-mermaid](https://github.com/pksebben/excalidraw-to-mermaid) |
| Mermaid -> Excalidraw | **Hydration** -- flowchart text becomes positioned shapes on the canvas | [@excalidraw/mermaid-to-excalidraw](https://www.npmjs.com/package/@excalidraw/mermaid-to-excalidraw) |

Color information round-trips too. Claude can highlight nodes with semantic colors using Mermaid `style` directives, and those colors render on the canvas.

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Shared HTTP Server                 │
│                  (Express + WebSocket)               │
│                                                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │Session A │  │Session B │  │Session C │  ...      │
│  │StateStore│  │StateStore│  │StateStore│            │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘            │
│       │              │              │                │
│  WS clients     WS clients     WS clients           │
└───┬───────────────┬──────────────────────────────────┘
    │               │
    ▼               ▼
 Browser A       Browser B
 (Excalidraw)    (Excalidraw)

 ┌──────────┐   ┌──────────┐
 │ MCP Proc │   │ MCP Proc │     ◄── separate Claude Code sessions
 │(client)  │   │(client)  │
 └──────────┘   └──────────┘
```

Multiple Claude Code sessions share a single HTTP server. The first process to arrive starts the server; subsequent processes detect it and connect as HTTP clients. Every session gets its own state, WebSocket clients, and URL.

---

## Features

### Multi-Session Support

Run multiple design sessions simultaneously -- useful for comparing current vs. proposed architectures:

```
> napkin_start { session: "current" }    → http://localhost:3210/s/current
> napkin_start { session: "proposed" }   → http://localhost:3210/s/proposed
```

Sessions from different Claude Code instances share the same server and appear in the same sidebar.

### Node Highlighting

Claude uses color to communicate status. These colors render as Excalidraw fill/stroke and survive round-trips:

| Color | Meaning | Mermaid Directive |
|-------|---------|-------------------|
| Blue | Topic of discussion | `style NODE fill:#d0ebff,stroke:#1971c2` |
| Yellow | New or changed | `style NODE fill:#fff3bf,stroke:#fab005` |
| Red | Problem | `style NODE fill:#ffe0e0,stroke:#e03131` |
| Green | Approved | `style NODE fill:#d3f9d8,stroke:#2f9e44` |

You can also apply these colors manually from the highlight buttons in the sidebar.

### History and Rollback

Every design change (from you or Claude) is recorded as a timestamped snapshot. The History panel in the sidebar lets you:

- Browse previous versions with Mermaid previews
- See who made each change (User vs Claude badge)
- Restore any previous version with one click
- Delete snapshots you no longer need

Claude can also navigate history programmatically via `napkin_get_history` and `napkin_rollback`.

### Persistence

Sessions are persisted to `.napkin/sessions/` as JSON files. If you restart the server and create a session with the same name, its history is restored from disk.

### Mermaid Validation

Before any diagram is stored, it's validated against the [Mermaid parser](https://github.com/mermaid-js/mermaid). Invalid syntax is rejected with descriptive error messages. Currently supported diagram types for round-tripping:

- `flowchart` / `graph` (TD, LR, BT, RL)
- `sequenceDiagram`
- `classDiagram`

Other diagram types are rejected with a suggestion to use a flowchart instead.

---

## MCP Tools

Napkin exposes 7 tools via the [Model Context Protocol](https://modelcontextprotocol.io/):

| Tool | Description |
|------|-------------|
| `napkin_start` | Start a session. Returns `{ url, session }` |
| `napkin_stop` | Stop one session or all sessions |
| `napkin_read_design` | Read current design as `{ mermaid, selectedElements, nodeCount, edgeCount }` |
| `napkin_write_design` | Write a Mermaid diagram (validated, then pushed to canvas) |
| `napkin_get_history` | Get timestamped design snapshots |
| `napkin_rollback` | Restore a previous design by timestamp |
| `napkin_list_sessions` | List all active sessions across all Claude Code instances |

---

## Development

### Project Structure

```
src/
├── client/                  # React + Excalidraw frontend
│   ├── App.tsx              # Main canvas component
│   ├── HistoryPanel.tsx     # History browser sidebar
│   └── ws-client.ts         # WebSocket client
├── server/                  # Node.js backend
│   ├── index.ts             # Entry point (wires MCP + persistence)
│   ├── mcp.ts               # MCP tool definitions
│   ├── session-manager.ts   # HTTP client to shared server
│   ├── shared-server.ts     # Express + WebSocket server (owns all state)
│   ├── state.ts             # In-memory state store per session
│   ├── dehydrator.ts        # Excalidraw → Mermaid conversion
│   ├── validator.ts         # Mermaid syntax validation
│   └── persistence.ts       # File-based session persistence
├── shared/
│   ├── types.ts             # Shared TypeScript interfaces
│   └── colors.ts            # Highlight color definitions
└── skills/
    └── napkin/SKILL.md      # Claude Code skill (auto-loaded)
```

### Scripts

```bash
npm run dev:client     # Vite dev server with HMR (port 5173)
npm run dev:server     # TypeScript server with watch mode (port 3210)
npm run build          # Production build (client + server bundle)
npm run build:plugin   # Package as Claude Code plugin
npm test               # Run all tests (vitest)
npm run test:watch     # Tests in watch mode
```

For local development, run `dev:client` and `dev:server` in separate terminals. The Vite dev server proxies API and WebSocket requests to the backend.

### Running Tests

```bash
npm test
```

Tests cover all server components with 81 tests across 7 test files:

- `state.test.ts` -- StateStore operations
- `dehydrator.test.ts` -- Excalidraw-to-Mermaid conversion
- `validator.test.ts` -- Mermaid syntax validation
- `persistence.test.ts` -- File-based session persistence
- `shared-server.test.ts` -- HTTP API and WebSocket server
- `session-manager.test.ts` -- Multi-process server discovery
- `mcp.test.ts` -- End-to-end MCP tool logic

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NAPKIN_PORT` | `3210` | Port for the shared HTTP server |

---

## How the Multi-Process Architecture Works

A key design goal: multiple Claude Code sessions can collaborate on the same Napkin server without port conflicts.

```
Process A (first):  MCP → SessionManager → starts SharedServer(:3210) → HTTP client
Process B (later):  MCP → SessionManager → detects server on :3210    → HTTP client
```

1. When a SessionManager needs a server, it probes `localhost:{port}/api/sessions`
2. If reachable, it connects as a client (doesn't own the server)
3. If not, it starts the server and becomes the owner
4. If `startSharedServer` races and throws `EADDRINUSE`, it retries the probe
5. On shutdown, each process only destroys its own sessions; the server stays up until its owner exits

---

## Contributing

1. Fork the repo
2. Create a feature branch
3. Write tests first (`npm run test:watch`)
4. Implement the feature
5. Ensure `npm test` and `npm run build` pass
6. Open a PR

---

## License

MIT
