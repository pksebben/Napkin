# Install to ~/.local + Skill-into-MCP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `napkin install` copy artifacts to `~/.local/share/napkin/` (self-contained, clone-deletable) and move SKILL.md content into an MCP prompt served by the server itself.

**Architecture:** The install command in `cli.ts` gets rewritten to copy `dist/` contents into `~/.local/share/napkin/`, symlink `~/.local/bin/napkin`, write a `version.json` for upgrade detection, and register via `claude mcp add`. The skill content moves into `mcp.ts` as a `server.prompt("napkin_guide", ...)` registration, and tool descriptions get lightly enriched. `skills/napkin/SKILL.md` is deleted.

**Tech Stack:** Node.js fs/path/os, @modelcontextprotocol/sdk `registerPrompt()`, vitest

---

### Task 1: Add the `napkin_guide` MCP prompt

**Files:**
- Modify: `src/server/mcp.ts:1-14` (add prompt registration after server creation)

**Step 1: Write the failing test**

Add to `src/server/mcp.test.ts` at the end, inside a new describe block:

```typescript
import { createMcpServer } from "./mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

describe("MCP prompts", () => {
  it("napkin_guide prompt returns usage guide", async () => {
    const manager = new SessionManager(undefined, 0);
    const server = createMcpServer(manager);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const result = await client.getPrompt({ name: "napkin_guide" });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content).toMatchObject({ type: "text" });

    const text = (result.messages[0].content as { type: "text"; text: string }).text;
    expect(text).toContain("Napkin");
    expect(text).toContain("napkin_start");
    expect(text).toContain("flowchart TD");
    expect(text).toContain("fill:#d0ebff");

    await manager.destroyAll();
    await server.close();
    await client.close();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /tmp/Napkin && npx vitest run src/server/mcp.test.ts`
Expected: FAIL -- "napkin_guide" prompt not found or similar MCP error.

**Step 3: Add the prompt registration to `mcp.ts`**

In `src/server/mcp.ts`, after the `const server = new McpServer(...)` block (after line 14), add:

```typescript
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
```

At the top of the file (after imports, before `createMcpServer`), add the guide constant:

```typescript
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

\`\`\`mermaid
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
\`\`\`

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
```

**Step 4: Run test to verify it passes**

Run: `cd /tmp/Napkin && npx vitest run src/server/mcp.test.ts`
Expected: ALL PASS (existing 9 tests + 1 new prompt test)

**Step 5: Commit**

```bash
cd /tmp/Napkin
git add src/server/mcp.ts src/server/mcp.test.ts
git commit -m "feat: add napkin_guide MCP prompt with full usage guide"
```

---

### Task 2: Enrich tool descriptions

**Files:**
- Modify: `src/server/mcp.ts:17-124` (update tool description strings)

**Step 1: Write the failing test**

Add to the new "MCP prompts" describe block in `src/server/mcp.test.ts`:

```typescript
  it("tool descriptions reference napkin_guide prompt", async () => {
    const manager = new SessionManager(undefined, 0);
    const server = createMcpServer(manager);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const { tools } = await client.listTools();
    const startTool = tools.find(t => t.name === "napkin_start");
    expect(startTool?.description).toContain("napkin_guide");

    await manager.destroyAll();
    await server.close();
    await client.close();
  });
```

**Step 2: Run test to verify it fails**

Run: `cd /tmp/Napkin && npx vitest run src/server/mcp.test.ts`
Expected: FAIL -- napkin_start description does not contain "napkin_guide"

**Step 3: Update tool descriptions**

In `src/server/mcp.ts`, update the description strings for each tool:

- `napkin_start` (line 19): `"Start a Napkin collaborative design session. Returns { url, session }. Use the napkin_guide prompt for workflow instructions and highlighting conventions."`
- `napkin_stop` (line 32): `"Stop a Napkin session (by name) or all sessions (omit session). Cleans up server resources."`
- `napkin_read_design` (line 49): `"Read the current design from a Napkin session as { mermaid, selectedElements, nodeCount, edgeCount }. selectedElements indicates what the user is pointing at."`
- `napkin_write_design` (line 62): `"Write a Mermaid diagram to a Napkin session. Supported types: flowchart/graph, sequenceDiagram, classDiagram. Use style directives for node highlighting (see napkin_guide prompt)."`
- `napkin_get_history` (line 81): `"Get timestamped design snapshots for a Napkin session. Each entry includes source (user/claude) and mermaid content."`
- `napkin_rollback` (line 93): `"Rollback to a previous design by timestamp. Get timestamps from napkin_get_history."`
- `napkin_list_sessions` (line 117): `"List all active Napkin sessions with their URLs."`

**Step 4: Run test to verify it passes**

Run: `cd /tmp/Napkin && npx vitest run src/server/mcp.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
cd /tmp/Napkin
git add src/server/mcp.ts src/server/mcp.test.ts
git commit -m "feat: enrich MCP tool descriptions, reference napkin_guide prompt"
```

---

### Task 3: Delete SKILL.md and update package.json

**Files:**
- Delete: `skills/napkin/SKILL.md`
- Delete: `skills/napkin/` (directory)
- Delete: `skills/` (directory, now empty)
- Modify: `package.json:19-22` (remove `"skills/"` from `files` array)

**Step 1: Delete the skill file and directory**

```bash
cd /tmp/Napkin
rm -rf skills/
```

**Step 2: Remove `"skills/"` from `package.json` `files` array**

In `package.json`, change:

```json
  "files": [
    "dist/",
    "skills/"
  ],
```

to:

```json
  "files": [
    "dist/"
  ],
```

**Step 3: Run full test suite to verify nothing breaks**

Run: `cd /tmp/Napkin && npm test`
Expected: ALL 81 tests PASS (+ 2 new = 83 total). No test depends on SKILL.md.

**Step 4: Commit**

```bash
cd /tmp/Napkin
git add -A
git commit -m "chore: remove skills/napkin/SKILL.md, now served as MCP prompt"
```

---

### Task 4: Rewrite the install command in `cli.ts`

**Files:**
- Modify: `src/server/cli.ts` (full rewrite of install logic)

**Step 1: Rewrite `cli.ts`**

Replace the entire file content with:

```typescript
import path from "path";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";

declare const __IS_BUNDLE__: boolean;

interface VersionInfo {
  version: string;
}

function getDistDir(): string {
  if (typeof __IS_BUNDLE__ !== "undefined" && __IS_BUNDLE__) {
    return __dirname;
  }
  return path.resolve(__dirname, "../../dist");
}

function getVersion(): string {
  // Read version from package.json at build time (esbuild inlines it)
  // Fallback to reading the installed version.json
  return "0.2.0"; // Will be replaced by build-time define
}

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function install(): void {
  const distDir = getDistDir();
  const version = getVersion();
  const shareDir = path.join(os.homedir(), ".local", "share", "napkin");
  const binDir = path.join(os.homedir(), ".local", "bin");
  const bundleDest = path.join(shareDir, "napkin.cjs");
  const linkPath = path.join(binDir, "napkin");
  const versionFile = path.join(shareDir, "version.json");

  // Detect existing install
  let previousVersion: string | null = null;
  try {
    const existing: VersionInfo = JSON.parse(fs.readFileSync(versionFile, "utf-8"));
    previousVersion = existing.version;
  } catch {}

  if (previousVersion && previousVersion !== version) {
    console.log(`Upgrading Napkin ${previousVersion} -> ${version}`);
  } else if (previousVersion) {
    console.log(`Reinstalling Napkin ${version}`);
  } else {
    console.log(`Installing Napkin ${version}`);
  }

  // Copy dist/ contents to ~/.local/share/napkin/
  // Clean existing install first
  fs.rmSync(shareDir, { recursive: true, force: true });
  fs.mkdirSync(shareDir, { recursive: true });

  // Copy the server bundle
  const srcBundle = path.join(distDir, "napkin.cjs");
  fs.copyFileSync(srcBundle, bundleDest);
  fs.chmodSync(bundleDest, 0o755);

  // Copy client assets
  const srcClient = path.join(distDir, "client");
  const destClient = path.join(shareDir, "client");
  copyDirSync(srcClient, destClient);

  // Write version.json
  fs.writeFileSync(versionFile, JSON.stringify({ version }, null, 2) + "\n");

  console.log(`Copied artifacts to ${shareDir}`);

  // Create ~/.local/bin/napkin symlink
  fs.mkdirSync(binDir, { recursive: true });
  try { fs.unlinkSync(linkPath); } catch {}
  fs.symlinkSync(bundleDest, linkPath);
  console.log(`Linked: ${linkPath} -> ${bundleDest}`);

  // Check if ~/.local/bin is on PATH
  const pathDirs = (process.env.PATH || "").split(path.delimiter);
  if (!pathDirs.includes(binDir)) {
    console.log(`\nNote: ${binDir} is not on your PATH.`);
    console.log(`Add it with:  export PATH="${binDir}:$PATH"`);
    console.log(`Then add that line to your shell profile (~/.bashrc, ~/.zshrc, etc.)\n`);
  }

  // Register with Claude Code
  try {
    execSync("claude mcp remove napkin --scope user >/dev/null 2>&1; claude mcp add --scope user napkin -- napkin mcp", {
      stdio: "inherit",
    });
    console.log("\nNapkin installed. Restart Claude Code to activate.");
  } catch {
    console.error("Failed to register via 'claude mcp add'. Is Claude Code installed?");
    process.exit(1);
  }
}

const command = process.argv[2];

if (command === "mcp" || !command) {
  import("./index.js").catch((err) => {
    console.error("Failed to start MCP server:", err);
    process.exit(1);
  });
} else if (command === "install") {
  install();
} else {
  console.log("Usage:");
  console.log("  napkin mcp       Start the MCP server (used by Claude Code)");
  console.log("  napkin install   Add Napkin to Claude Code's MCP config");
}
```

**Step 2: Update `build-server.mjs` to define `__NAPKIN_VERSION__`**

In `scripts/build-server.mjs`, add a version define so the bundle knows its version at build time. Read it from `package.json`:

```javascript
import esbuild from "esbuild";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

await esbuild.build({
  entryPoints: ["src/server/cli.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/napkin.cjs",
  banner: {
    js: [
      "#!/usr/bin/env node",
      'const _importMetaUrl = require("url").pathToFileURL(__filename).href;',
    ].join("\n"),
  },
  define: {
    "import.meta.url": "_importMetaUrl",
    "__IS_BUNDLE__": "true",
    "__NAPKIN_VERSION__": JSON.stringify(pkg.version),
  },
  external: ["bufferutil", "utf-8-validate"],
});

console.log("Server bundle built: dist/napkin.cjs");
```

Then in `cli.ts`, update `getVersion()`:

```typescript
declare const __NAPKIN_VERSION__: string;

function getVersion(): string {
  if (typeof __NAPKIN_VERSION__ !== "undefined") {
    return __NAPKIN_VERSION__;
  }
  // Fallback for dev mode: read package.json
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"));
  return pkg.version;
}
```

**Step 3: Build and test install**

Run: `cd /tmp/Napkin && npm run build`
Expected: Build succeeds.

Run: `cd /tmp/Napkin && node dist/napkin.cjs install`
Expected output includes:
- "Installing Napkin 0.2.0" (or "Upgrading" if already installed)
- "Copied artifacts to /Users/.../.local/share/napkin"
- "Linked: /Users/.../.local/bin/napkin -> /Users/.../.local/share/napkin/napkin.cjs"
- MCP registration succeeds

Verify:
```bash
ls -la ~/.local/share/napkin/
ls -la ~/.local/share/napkin/client/
cat ~/.local/share/napkin/version.json
ls -la ~/.local/bin/napkin
```

**Step 4: Run full test suite**

Run: `cd /tmp/Napkin && npm test`
Expected: ALL PASS

**Step 5: Commit**

```bash
cd /tmp/Napkin
git add src/server/cli.ts scripts/build-server.mjs
git commit -m "feat: install copies artifacts to ~/.local/share/napkin, version detection"
```

---

### Task 5: End-to-end verification

**Step 1: Clean slate test**

```bash
rm -rf ~/.local/share/napkin ~/.local/bin/napkin
cd /tmp/Napkin && npm run build && node dist/napkin.cjs install
```

Expected: Fresh "Installing Napkin 0.2.0" output, all files in place.

**Step 2: Upgrade test**

```bash
cd /tmp/Napkin && node dist/napkin.cjs install
```

Expected: "Reinstalling Napkin 0.2.0" (same version = reinstall message).

**Step 3: Verify MCP server starts from installed location**

```bash
echo '{}' | timeout 2 ~/.local/share/napkin/napkin.cjs mcp 2>&1 || true
```

Expected: Starts without errors (will timeout/close since no real MCP client, but shouldn't crash).

**Step 4: Verify symlink works from PATH**

```bash
zsh -l -c 'which napkin'
```

Expected: `/Users/<user>/.local/bin/napkin`

**Step 5: Final full test suite**

Run: `cd /tmp/Napkin && npm test`
Expected: ALL PASS

**Step 6: Commit any remaining changes**

If any fixups were needed, commit them now.
