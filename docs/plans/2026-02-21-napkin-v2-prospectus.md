# Napkin v2 Prospectus: Production Packaging & Multi-Session Support

## Problem Statement

Napkin works in the development environment where it was built, but breaks everywhere else. The current deployment model assumes:

- A specific directory structure (`/home/mlbot/code/Napkin`)
- Dev tools at runtime (`npx tsx`)
- A shell script wrapper to fix `cwd` issues
- Single-user, single-session operation
- Manual skill file installation to `~/.claude/skills/`

None of this survives contact with another machine, another user, or even another terminal tab.

---

## Target: Claude Code Plugin

Claude Code has a plugin system designed for exactly this use case. A plugin is a self-contained directory:

```
napkin/
├── .claude-plugin/
│   └── plugin.json            # manifest: name, version, description
├── skills/
│   └── napkin/
│       └── SKILL.md           # auto-loaded by Claude Code
├── .mcp.json                  # MCP server config (auto-started)
└── dist/
    ├── server/
    │   └── napkin-server.cjs   # single-file bundled MCP+HTTP server
    └── client/
        ├── index.html          # Vite-built Excalidraw SPA
        └── assets/
```

Users install via:
```
/plugin marketplace add pksebben/napkin
/plugin install napkin@pksebben/napkin
```

The plugin system handles:
- Copying files to `~/.claude/plugins/cache/` (stable, known location)
- Making the skill discoverable (no manual file placement)
- Starting the MCP server automatically (using `${CLAUDE_PLUGIN_ROOT}` for paths)
- Scoping (user, project, or managed)

---

## Four Changes Required

### 1. esbuild Bundle (kill npx/tsx/shell scripts)

**Current:** `npx tsx src/server/index.ts` via a bash wrapper
**Target:** Single `napkin-server.cjs` file with zero runtime dependencies

The server code (MCP + Express + WebSocket) gets bundled into one file via esbuild:

```js
// build.mjs
import { build } from "esbuild";
await build({
  entryPoints: ["src/server/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/server/napkin-server.cjs",
  banner: { js: "#!/usr/bin/env node" },
  external: ["excalidraw-to-mermaid"],  // if it has native deps
});
```

This eliminates:
- `tsx` as a runtime dependency
- `npx` invocation entirely
- Shell script wrappers
- `node_modules` resolution issues from wrong `cwd`
- The entire class of "works on my machine" path bugs

The `.mcp.json` becomes:
```json
{
  "napkin": {
    "command": "node",
    "args": ["${CLAUDE_PLUGIN_ROOT}/dist/server/napkin-server.cjs"]
  }
}
```

`node` is the only external dependency. It's always there.

### 2. Multi-Session Support

**Current:** One global `StateStore`, one HTTP server on port 3210
**Target:** Named sessions with isolated state and dynamic port allocation

When a user says "grab a napkin," they get a session. If they're running three agents doing three different designs, that's three sessions, three ports, three browser tabs.

**Server-side model:**
```
SessionManager
  ├── session "auth-redesign"   → StateStore + HttpServer @ :0 (OS-assigned)
  ├── session "data-pipeline"   → StateStore + HttpServer @ :0
  └── session "api-gateway"     → StateStore + HttpServer @ :0
```

**MCP tool changes:**
- `napkin_start` gains an optional `session` parameter (defaults to `"default"`)
- `napkin_read_design` / `napkin_write_design` / etc. all take `session`
- `napkin_stop` can stop one session or all
- `napkin_list_sessions` — new tool, returns active sessions with their URLs

**Port allocation:** Bind to port `0` and let the OS assign. Return the actual port in the `napkin_start` response. No more port collisions.

### 3. Static Asset Resolution (no more path hacks)

**Current:** `path.resolve(__dirname, "../..")` to find `dist/client/`
**Target:** Resolve relative to the bundled server file's location

In the esbuild bundle, `__dirname` points to wherever the `.cjs` file lives. The client assets are always at `../client/` relative to the server bundle:

```
dist/
├── server/
│   └── napkin-server.cjs   ← __dirname is here
└── client/
    └── index.html          ← ../client/ relative to server
```

This works identically whether the plugin is:
- In `~/.claude/plugins/cache/napkin/dist/server/`
- In `/home/mlbot/code/Napkin/dist/server/`
- In `/usr/local/lib/node_modules/napkin/dist/server/`

One path. Always correct.

### 4. Plugin Manifest & Skill Packaging

**Current:** Skill manually copied to `~/.claude/skills/napkin/`
**Target:** Skill bundled in the plugin, auto-discovered

```json
// .claude-plugin/plugin.json
{
  "name": "napkin",
  "version": "0.2.0",
  "description": "Collaborative system design on the back of a napkin. Bidirectional Excalidraw ↔ Mermaid bridge for Claude Code.",
  "author": "pksebben"
}
```

The skill at `skills/napkin/SKILL.md` gets namespaced as `napkin:napkin` automatically. The skill file gets minor updates to reference the multi-session workflow.

---

## What Gets Deleted

| Artifact | Reason |
|----------|--------|
| `napkin-mcp.sh` | Replaced by bundled `.cjs` — no wrapper needed |
| `~/.claude/skills/napkin/` | Skill ships inside the plugin |
| `~/.claude/mcp.json` napkin entry | MCP config ships inside the plugin |
| `src/server/cli.ts` `install` command | Plugin system handles installation |
| `tsconfig.node.json` | esbuild replaces tsc for server build |
| `tsx` dev dependency (for production) | Not needed at runtime |

The `napkin mcp` CLI subcommand stays as a fallback for non-plugin usage (e.g., standalone `claude mcp add`).

---

## What Gets Added

| Artifact | Purpose |
|----------|---------|
| `build.mjs` | esbuild script for server bundle |
| `.claude-plugin/plugin.json` | Plugin manifest |
| `.mcp.json` (plugin root) | MCP server config with `${CLAUDE_PLUGIN_ROOT}` |
| `src/server/session-manager.ts` | Multi-session lifecycle (create, get, destroy, list) |
| Dynamic port allocation | `server.listen(0)` + report actual port |
| `napkin_list_sessions` MCP tool | Query active sessions |

---

## Build Pipeline

```
npm run build
  ├── vite build              → dist/client/    (Excalidraw SPA)
  └── node build.mjs          → dist/server/    (bundled MCP+HTTP server)

npm run build:plugin
  └── Copies dist/, skills/, .claude-plugin/, .mcp.json → plugin/
```

---

## Distribution Paths

### Path A: Plugin Marketplace (primary)
```
/plugin marketplace add pksebben/napkin
/plugin install napkin@pksebben/napkin
# Done. Skill + MCP server available immediately after restart.
```

### Path B: npm Global Install (fallback)
```
npm install -g napkin
napkin install    # registers via `claude mcp add --scope user`
# Skill file needs manual placement or CLAUDE.md reference
```

### Path C: Development (contributors)
```
git clone ... && cd napkin && npm install
npm run build
claude mcp add napkin -- node dist/server/napkin-server.cjs
```

---

## Multi-Session UX Sketch

```
User: "Let's sketch the auth system"
Claude: calls napkin_start(session: "auth-system")
  → "Napkin ready at http://localhost:54321 — session: auth-system"

User: (in another agent/tab)
Agent: "Let's design the data pipeline"
Claude: calls napkin_start(session: "data-pipeline")
  → "Napkin ready at http://localhost:54322 — session: data-pipeline"

User: "What napkins do I have open?"
Claude: calls napkin_list_sessions()
  → auth-system:    http://localhost:54321 (2 snapshots)
  → data-pipeline:  http://localhost:54322 (1 snapshot)
```

---

## Open Questions (for tomorrow)

1. **Marketplace hosting:** Create a dedicated marketplace repo (`pksebben/napkin`) or add to an existing marketplace? The marketplace is just a git repo with a `.claude-plugin/marketplace.json` catalog.

 - i see no reaons not to put this on my git public.  We'll do that.

2. **Session naming:** Auto-generate session names from context, or always require explicit names? Default `"default"` for single-session use keeps backward compatibility.

 - i think we auto-generate, or claude decides. 

3. **excalidraw-to-mermaid bundling:** This package may have issues with esbuild bundling (it does unusual things internally). May need to mark it `external` and list as a dependency, or vendor it. Needs testing.

 - let's see what shakes out when we build.

4. **Persistence:** Currently all state is in-memory and lost on server restart. Is that acceptable for v2, or should we add file-based snapshot persistence (e.g., `~/.napkin/sessions/`)?

 - that sounds to me like a v3 feature.  Stub todo and defer.

5. **npm publishing:** Do you want to publish to npm as well (for Path B), or is the plugin marketplace sufficient?

 - future question.  stub and defer.

6. **Client dev workflow:** During development, should `vite dev` still work for hot-reload on the frontend? This means keeping the dual-server setup (Vite on 5173, Express on 3210) for dev, while the production build is single-server.

 - hot reload is really great to have.  Perhaps we should do this.

7. **Quick-paintbrush annotation toolbar:** Expose the highlighting color conventions (blue/yellow/red/green) as quick-access buttons in the Excalidraw UI, so users can annotate nodes with semantic colors without writing mermaid. Would render as Excalidraw `backgroundColor`/`strokeColor` on selected elements, and survive round-trip via `style` directives in the mermaid representation. Nice-to-have — stub and defer.
