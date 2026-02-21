# Napkin — Design Document

**A bidirectional bridge between Excalidraw and Claude Code for collaborative system design.**

User draws architecture diagrams in Excalidraw on one side of the screen, chats with Claude Code on the other. They push designs back and forth — like sketching on the back of a napkin — until the architecture is fleshed out.

---

## Architecture

Single Node.js/TypeScript process that does three things:

1. **Serves a custom Excalidraw web app** (React + `@excalidraw/excalidraw`) on `localhost:PORT`
2. **WebSocket** between browser and server for live push/pull of scenes
3. **MCP server** on stdio, started by Claude Code via `mcp.json`

The process starts dormant with every Claude Code session (just an MCP stdio handler — negligible overhead). The HTTP server, WebSocket, and Excalidraw UI only boot when Claude calls `napkin_start`.

```
┌──────────────────────────────────────────────┐
│              Napkin Process                   │
│              (Node.js)                        │
│                                              │
│   ┌─────────────┐    ┌──────────────────┐    │
│   │ MCP Server  │    │  HTTP + WS       │    │
│   │ (stdio)     │    │  Server          │    │
│   │             │    │  (lazy-started)  │    │
│   │ start/stop  │    │                  │    │
│   │ read_design │    │ Serves React app │    │
│   │ write_design│◄──►│ WebSocket sync   │    │
│   └─────────────┘    └──────────────────┘    │
│          ▲                    ▲               │
│          │         ┌─────────┘               │
│          ▼         ▼                         │
│   ┌────────────────────┐                     │
│   │   State Store      │                     │
│   │ (in-memory +       │                     │
│   │  history snapshots)│                     │
│   └────────────────────┘                     │
│          │         │                         │
│     ┌────┘         └────┐                    │
│     ▼                   ▼                    │
│ ┌──────────┐    ┌───────────┐                │
│ │Dehydrator│    │ Hydrator  │                │
│ │Excal→Mmd │    │ Mmd→Excal │                │
│ └──────────┘    └───────────┘                │
└──────────────────────────────────────────────┘
      ▲ stdio                    ▲ http://localhost:PORT
      │                          │
  Claude Code              User's browser
```

---

## Excalidraw Frontend

A React app embedding `@excalidraw/excalidraw` with three custom additions:

### Tabs/Scenes

- **"My Draft"** — user's active canvas. User draws here freely.
- **"Claude's Revision"** — read-only view of what Claude last pushed. Updated live via WebSocket.
- Tabs are separate Excalidraw scene states held in React. Switching tabs swaps the scene data.

### "Push to Claude" Button

- Grabs the current scene elements + the user's current selection
- Sends to server via WebSocket
- Server dehydrates to Mermaid, stores it as the latest user design
- Selected elements get annotated (e.g. `%% SELECTED: nodeA, edgeA-->B` comment in the Mermaid) so Claude knows what the user is pointing at

### Live Updates

- When Claude calls `napkin_write_design`, the server hydrates the Mermaid to Excalidraw elements and pushes to the browser via WebSocket
- The "Claude's Revision" tab updates automatically — user sees it appear in real time

No other UI chrome. Excalidraw provides its own toolbar, zoom, export, etc.

---

## MCP Tools

```
napkin_start
  → Boots the HTTP + WebSocket server, serves Excalidraw
  → Returns: { url: "http://localhost:PORT" }
  → Idempotent — if already running, just returns the URL

napkin_stop
  → Shuts down the HTTP server, frees the port
  → The MCP stdio process stays alive (costs nothing)

napkin_read_design
  → Returns: { mermaid: string, selectedElements: string[], nodeCount, edgeCount }
  → Reads whatever the user last pushed from Excalidraw
  → selectedElements tells Claude what the user highlighted

napkin_write_design
  → Accepts: { mermaid: string }
  → Validates mermaid syntax via @mermaid-js/parser
  → Hydrates to Excalidraw elements
  → Pushes to browser via WebSocket (updates "Claude's Revision" tab)
  → Snapshots the previous state to history
  → Returns: { success: bool, errors?: string[] }

napkin_get_history
  → Returns: list of timestamped snapshots (both user and Claude versions)
  → Parameters: { limit: number } (default 10)

napkin_rollback
  → Accepts: { timestamp: string }
  → Restores that snapshot as the current design
```

---

## Claude Skill

A Claude Code skill (`.md` file) that teaches Claude how to use Napkin for architecture conversations. Triggered when the user asks to sketch, design, or "grab a napkin."

The skill instructs Claude to:
1. Call `napkin_start` — boot the server, give the user the URL
2. When the user says they've pushed a design, call `napkin_read_design`
3. Reason about the architecture, ask questions, suggest changes
4. When suggesting changes, call `napkin_write_design` with modified Mermaid
5. Reference specific nodes/edges by their Mermaid IDs when discussing

The skill does NOT instruct Claude to start Napkin proactively.

---

## Conversion Pipeline

### Mermaid → Excalidraw (Hydrator)

- `@excalidraw/mermaid-to-excalidraw` 2.0.0 — official, well-maintained
- `parseMermaidToExcalidraw(mermaidSyntax)` → skeleton elements
- `convertToExcalidrawElements(elements)` → full Excalidraw JSON
- Only flowcharts get native elements; other diagram types fall back to embedded images

### Excalidraw → Mermaid (Dehydrator)

- `excalidraw-to-mermaid` 0.2.1 — brand new (Feb 2026), 88 tests, but low adoption
- `convert(excalidrawJson, { direction })` → `{ mermaid, nodeCount, edgeCount }`
- Supports: rectangles, rounded rects, diamonds, ellipses, arrows with labels, frames as subgraphs
- Fallback plan: write our own converter if this library proves too buggy. The Excalidraw JSON format is well-structured and extracting a graph is tractable.

### Mermaid Validation

- `@mermaid-js/parser` 1.0.0 — official standalone parser, no DOM dependencies
- Used to validate mermaid syntax before accepting writes from Claude

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js / TypeScript |
| Frontend | React + `@excalidraw/excalidraw` 0.18.0 (ESM-only) |
| Bundler | Vite |
| HTTP server | Express |
| WebSocket | `ws` |
| Mermaid → Excalidraw | `@excalidraw/mermaid-to-excalidraw` 2.0.0 |
| Excalidraw → Mermaid | `excalidraw-to-mermaid` 0.2.1 |
| Mermaid validation | `@mermaid-js/parser` 1.0.0 |
| MCP | `@modelcontextprotocol/sdk` 1.26.x (stdio transport) |
| State | In-memory + history snapshots to disk |

---

## Installation

One-time setup:

```bash
npm install -g napkin
napkin install  # adds entry to .claude/mcp.json
```

The `napkin install` command writes:

```json
// .claude/mcp.json
{
  "mcpServers": {
    "napkin": {
      "command": "napkin",
      "args": ["mcp"]
    }
  }
}
```

---

## User Workflow

1. User installs Napkin once → adds to `mcp.json`
2. Every Claude session: a dormant Node process starts (negligible overhead)
3. User says "let's sketch this on a napkin"
4. Claude skill fires → calls `napkin_start` → gets URL → shares it with user
5. User opens Excalidraw in browser, draws architecture
6. User clicks "Push to Claude" → Claude reads the design
7. They discuss, Claude pushes revisions, user sees them on "Claude's Revision" tab
8. Iterate until the design is solid
9. Session ends → HTTP server dies, process stays dormant until next time

---

## What's NOT in MVP

Deliberately excluded:
- File watching / chokidar (we have WebSocket)
- CLI commands beyond `install` and `mcp`
- Config files (hardcode sane defaults)
- Multiple diagram types (flowcharts only)
- Layout preservation / diff-based hydration (accept full re-layout)
- MCP prompts (`design_review`, `architecture_scaffold`)
- D2 support
- Multi-diagram support
- IDE integration of any kind

---

## Open Risks

1. **Excalidraw→Mermaid library maturity.** `excalidraw-to-mermaid` is 2 weeks old with 22 downloads. If it's buggy, we write our own (feasible — Excalidraw JSON is well-structured).
2. **Round-trip fidelity.** Styling (colors, line styles) will not survive. Spatial layout will be lost on hydration. Users need to accept this tradeoff for MVP.
3. **Flowcharts only.** The conversion libraries only handle flowcharts well. Sequence diagrams, class diagrams, etc. are out of scope.
