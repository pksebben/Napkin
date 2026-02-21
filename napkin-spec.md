# Napkin

**A bidirectional bridge between freeform canvas editing and AI-assisted system design.**

Napkin connects Excalidraw (freeform visual canvas) ↔ Mermaid (structured text DSL) ↔ Claude Code (AI reasoning via MCP), enabling a tight feedback loop where humans sketch system architectures visually and AI agents can read, critique, and modify the same designs — without any copy-pasting.

*You drew it on a napkin. Now it's a spec.*

---

## Problem

Designing distributed systems involves iterating between visual thinking (boxes and arrows) and structured specification (interfaces, dependencies, message flows). Today this requires manual translation: sketch in a canvas tool, then re-describe it in text for an AI, then manually update the canvas when the AI suggests changes. The feedback loop is broken.

## Solution

A local bridge server that:

1. Watches an Excalidraw canvas for changes and dehydrates edits to Mermaid
2. Exposes the current Mermaid state to Claude Code via MCP
3. Accepts Mermaid updates from Claude Code and hydrates them back to Excalidraw
4. All transitions happen automatically — no pasting, no exporting, no switching tabs

---

## Architecture

```
┌─────────────────────┐
│     Excalidraw       │  ← Human draws/edits freely
│   (browser tab)      │
└─────────┬───────────┘
          │  WebSocket (Excalidraw Collab API or file watch)
          ▼
┌─────────────────────┐
│   Napkin       │  ← The thing we're building
│   (local server)     │
│                      │
│  ┌───────────────┐   │
│  │ Canvas Watcher │   │  Detects Excalidraw changes
│  └──────┬────────┘   │
│         ▼            │
│  ┌───────────────┐   │
│  │  Dehydrator    │   │  Excalidraw JSON → Mermaid
│  │  (excalidraw-  │   │  (@excalidraw-to-mermaid/core)
│  │   to-mermaid)  │   │
│  └──────┬────────┘   │
│         ▼            │
│  ┌───────────────┐   │
│  │  State Store   │   │  Holds current mermaid + metadata
│  │  (.mmd file)   │   │  Source of truth for the design
│  └──────┬────────┘   │
│         ▼            │
│  ┌───────────────┐   │
│  │  Hydrator      │   │  Mermaid → Excalidraw JSON
│  │  (mermaid-to-  │   │  (@excalidraw/mermaid-to-excalidraw)
│  │   excalidraw)  │   │
│  └──────┬────────┘   │
│         ▼            │
│  ┌───────────────┐   │
│  │  MCP Server    │   │  Exposes tools to Claude Code
│  └───────────────┘   │
│                      │
└─────────────────────┘
          │  MCP (stdio or streamable-http)
          ▼
┌─────────────────────┐
│    Claude Code       │  ← AI reads/critiques/modifies design
└─────────────────────┘
```

---

## Components

### 1. Canvas Watcher

**Purpose:** Detect when the human edits the Excalidraw canvas and trigger dehydration.

**Approach options (pick one, in priority order):**

- **Option A — File watch:** Excalidraw can save to a `.excalidraw` JSON file (e.g. via the Excalidraw VS Code extension or Obsidian plugin). Use `chokidar` or `fs.watch` on that file. Simplest, most portable.
- **Option B — Excalidraw HTTP API:** Self-host Excalidraw with a custom plugin that POSTs the scene JSON to Napkin on every change. More responsive but more setup.
- **Option C — Collab WebSocket:** Tap into Excalidraw's collaboration protocol. Most complex, best real-time UX.

**Recommendation:** Start with Option A. The file-based approach works immediately with the VS Code Excalidraw extension and Obsidian plugin, both of which auto-save `.excalidraw` files. Upgrade to B or C later.

**Debounce:** Canvas changes should be debounced (e.g. 500ms–1s) before triggering dehydration to avoid thrashing during active editing.

### 2. Dehydrator (Excalidraw → Mermaid)

**Purpose:** Convert freeform canvas elements into structured Mermaid DSL.

**Implementation:**

- Use `@excalidraw-to-mermaid/core` npm package
- `excalidrawV2ToMermaidFlowChart(direction, excalidrawJson)` → mermaid string
- Alternatively, `excalidraw-converter` CLI (`excalidraw-converter mermaid -i file.excalidraw`)

**Caveats / known limitations:**

- Only flowcharts are well-supported for round-tripping currently
- Freeform shapes without text labels will be lost or approximated
- Arrow labels map to edge labels in mermaid
- Styling (colors, line styles) may not survive the round-trip — accept this as a tradeoff

**Convention enforcement:** For best round-trip fidelity, the user should follow naming conventions in their Excalidraw shapes (e.g. text inside rectangles becomes node labels, arrow text becomes edge labels). Document these conventions for the user.

### 3. State Store

**Purpose:** Hold the canonical Mermaid representation plus metadata.

**Structure:**

```
project-root/
├── .napkin/
│   ├── design.mmd            # Current mermaid source of truth
│   ├── design.excalidraw     # Last-known excalidraw state
│   ├── history/              # Timestamped snapshots for undo
│   │   ├── 2025-02-20T10-30-00.mmd
│   │   └── 2025-02-20T10-31-00.mmd
│   └── config.json           # Bridge configuration
```

**`config.json`:**

```json
{
  "excalidraw_source": "./architecture.excalidraw",
  "mermaid_output": "./.napkin/design.mmd",
  "watch_debounce_ms": 500,
  "auto_hydrate": true,
  "history_max_entries": 50,
  "diagram_type": "flowchart",
  "flowchart_direction": "TD"
}
```

**Conflict resolution:** If both the canvas and Claude Code modify the design simultaneously, last-write-wins with history snapshots for recovery. The history directory makes this safe — you can always roll back.

### 4. Hydrator (Mermaid → Excalidraw)

**Purpose:** Convert Mermaid DSL back to Excalidraw elements when Claude Code makes changes.

**Implementation:**

- Use `@excalidraw/mermaid-to-excalidraw` npm package
- `parseMermaidToExcalidraw(mermaidSyntax)` → skeleton elements
- `convertToExcalidrawElements(elements)` → full Excalidraw JSON
- Write the result to the `.excalidraw` file, triggering the editor to reload

**Layout preservation:** This is the hard part. Mermaid→Excalidraw will re-layout everything, potentially losing the human's carefully arranged spatial positions. Mitigation strategies:

- Preserve the previous Excalidraw layout and only update nodes/edges that changed (diff-based hydration) — this is a V2 feature
- For V1, accept full re-layout on hydration and rely on Excalidraw's own undo

### 5. MCP Server

**Purpose:** Expose the design to Claude Code as readable/writable tools.

**Transport:** stdio for simplest Claude Code integration. Streamable-http as an option for other MCP clients.

**Tools exposed:**

```
napkin_read_design
  → Returns: current mermaid string + metadata (node count, edge count, last modified)
  → No parameters

napkin_write_design
  → Accepts: mermaid string
  → Validates mermaid syntax before writing
  → Triggers hydration to Excalidraw
  → Returns: success/failure + validation errors if any

napkin_get_history
  → Returns: list of timestamped snapshots
  → Parameters: limit (default 10)

napkin_rollback
  → Accepts: timestamp
  → Restores that snapshot as the current design

napkin_diff
  → Returns: textual diff between current design and a previous snapshot
  → Parameters: timestamp (optional, defaults to previous)

napkin_annotate
  → Accepts: node_id, annotation text
  → Adds a comment/note to a specific node (stored as metadata alongside the mermaid)
  → Useful for Claude Code to leave design review comments
```

**Prompts exposed (MCP prompts, not tools):**

```
design_review
  → System prompt that instructs Claude to analyze the current design for:
    - Circular dependencies
    - Missing error handling paths
    - Single points of failure
    - Naming consistency
    - Suggested decomposition

architecture_scaffold
  → System prompt that instructs Claude to:
    - Read the current design
    - Generate interface definitions / type stubs for each node
    - Generate message type definitions for each edge
    - Output as pseudocode or a specified language
```

---

## Technology Choices

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Runtime | Node.js / TypeScript | Both conversion libraries are npm packages. MCP SDK is TypeScript-first. |
| MCP SDK | `@modelcontextprotocol/sdk` | Official SDK for building MCP servers |
| Dehydration | `@excalidraw-to-mermaid/core` | Only maintained excalidraw→mermaid library |
| Hydration | `@excalidraw/mermaid-to-excalidraw` | Official Excalidraw library |
| File watching | `chokidar` | Battle-tested, cross-platform file watcher |
| Mermaid validation | `mermaid` (npm) | Use mermaid's own parser to validate before writing |
| CLI framework | `commander` or bare `process.argv` | Keep it simple |

---

## User Workflow

### Setup

```bash
npm install -g napkin
cd my-project
napkin init                    # Creates .napkin/ dir + config
napkin watch architecture.excalidraw  # Starts the bridge server
```

This also registers itself as an MCP server for Claude Code. The user can alternatively add it manually:

```json
// .claude/mcp.json
{
  "mcpServers": {
    "napkin": {
      "command": "napkin",
      "args": ["serve", "--project", "."]
    }
  }
}
```

### Drawing Phase

1. User opens `architecture.excalidraw` in VS Code (Excalidraw extension) or browser
2. User draws boxes (services), arrows (dependencies/messages), labels (names)
3. Napkin detects file changes, dehydrates to `.napkin/design.mmd`
4. Mermaid file is now readable by Claude Code

### AI Review Phase

User in Claude Code:
```
> Review my current system design and tell me if there are any issues
```

Claude Code calls `napkin_read_design`, gets the mermaid, reasons about it, and responds with critique and suggested changes.

### AI Modification Phase

User in Claude Code:
```
> Add a message queue between the API gateway and the worker service,
  and add a dead letter queue for failed messages
```

Claude Code calls `napkin_read_design`, modifies the mermaid, calls `napkin_write_design` with the updated version. The Excalidraw canvas automatically updates.

### Iteration

The human sees the AI's changes on the canvas, drags things around to improve the layout, adds a new service, saves. Claude Code sees the updated design. Repeat.

---

## Implementation Phases

### Phase 1 — MVP (get the loop working)

- [ ] File watcher on `.excalidraw` files with debounce
- [ ] Dehydration via `@excalidraw-to-mermaid/core`
- [ ] Hydration via `@excalidraw/mermaid-to-excalidraw`
- [ ] MCP server with `read_design` and `write_design` tools
- [ ] Basic CLI: `napkin init`, `napkin watch`, `napkin serve`
- [ ] Mermaid syntax validation before writes
- [ ] Auto-save history snapshots on every change

### Phase 2 — Polish

- [ ] `get_history`, `rollback`, `diff` MCP tools
- [ ] `annotate` tool for design review comments
- [ ] MCP prompts for `design_review` and `architecture_scaffold`
- [ ] Config file support (debounce timing, diagram type, direction)
- [ ] Better error messages and recovery from malformed excalidraw

### Phase 3 — Real-time & Layout Preservation

- [ ] WebSocket-based canvas watching (Option B or C from above)
- [ ] Diff-based hydration that preserves spatial layout for unchanged nodes
- [ ] Multi-diagram support (multiple `.excalidraw` files in one project)
- [ ] Collaborative mode (multiple users editing the canvas + AI simultaneously)

### Phase 4 — Code Generation Bridge

- [ ] `scaffold` MCP tool that generates code stubs from the design
- [ ] Language-specific templates (Go, TypeScript, Python)
- [ ] Integration with Claude Code's file creation — generate interfaces directly into the project tree
- [ ] Bi-directional: code changes detected → suggest design updates

---

## Open Questions

1. **Diagram type scope:** Mermaid supports flowcharts, sequence diagrams, class diagrams, etc. The round-trip libraries only handle flowcharts well. Should we scope to flowcharts only for V1, or attempt to support sequence diagrams (useful for message flow) with a degraded freeform experience?

2. **Layout preservation strategy:** Full re-layout on hydration is jarring. Diff-based hydration that only updates changed nodes is the dream but adds significant complexity. Is there a simpler middle ground? (e.g. preserve x/y coordinates in metadata sidecar and re-apply after hydration?)

3. **Excalidraw hosting:** File-watch mode requires the user to have an Excalidraw editor that saves to disk. The VS Code extension does this. The browser version at excalidraw.com does NOT (it uses localStorage). Should we bundle a self-hosted Excalidraw instance with Napkin for zero-setup?

4. **Multiple canonical formats:** Should the state store also support D2 alongside Mermaid? D2 produces better-looking diagrams and has a richer feature set, but the conversion libraries are less mature.

5. **Naming:** Napkin is a placeholder. Better names welcome.

---

## References

- `claude-mermaid` MCP server: https://github.com/veelenga/claude-mermaid
- `@excalidraw-to-mermaid/core`: https://www.npmjs.com/package/@excalidraw-to-mermaid/core
- `excalidraw-converter` CLI: https://github.com/sindrel/excalidraw-converter
- `@excalidraw/mermaid-to-excalidraw`: https://github.com/excalidraw/mermaid-to-excalidraw
- Excalidraw: https://excalidraw.com
- D2 language: https://d2lang.com
- MCP specification: https://modelcontextprotocol.io
