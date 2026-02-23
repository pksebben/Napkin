# Install to ~/.local + Skill-into-MCP Migration

**Date:** 2026-02-23

## Problem

1. `napkin install` creates a symlink to wherever the git clone lives (often /tmp). If the clone is deleted or moved, the install breaks.
2. The SKILL.md is project-scoped -- it only works when Claude Code is running inside the Napkin repo, not when Napkin is installed globally as an MCP server.

## Design

### Install layout

`napkin install` copies all built artifacts into `~/.local/share/napkin/` so the clone can be deleted after install:

```
~/.local/
  share/napkin/
    napkin.cjs          # server bundle (copied)
    client/             # built Excalidraw frontend (copied)
    version.json        # { "version": "0.2.0" } for upgrade detection
  bin/
    napkin              # symlink -> ../share/napkin/napkin.cjs
```

Install command flow:
1. Read `version.json` from existing install (if any) to detect upgrades
2. Create `~/.local/share/napkin/` (recursive)
3. Copy `dist/napkin.cjs` and `dist/client/` into it
4. `chmod +x` the copied bundle
5. Create/update `~/.local/bin/napkin` symlink pointing to the copy
6. Write `version.json` with current version
7. Print upgrade message if versions differ ("Upgrading 0.1.0 -> 0.2.0")
8. Run `claude mcp add --scope user napkin -- napkin mcp`

### Skill content into MCP prompt

- Register `napkin_guide` MCP prompt via `server.prompt()` containing the full behavioral guide (workflow, highlighting, rules, examples)
- Lightly enrich existing tool descriptions to point Claude toward the prompt
- Delete `skills/napkin/SKILL.md` from the repo

### Client asset resolution

No changes needed. `shared-server.ts` already resolves client assets relative to `__dirname` when bundled (`path.join(__dirname, "client")`). Since install copies both `napkin.cjs` and `client/` into the same directory, this works as-is.

## Files changed

| File | Change |
|------|--------|
| `src/server/cli.ts` | Rewrite install: copy dist/ to ~/.local/share/napkin/, version detection, upgrade messages |
| `src/server/mcp.ts` | Add `server.prompt("napkin_guide", ...)` with guide content; enrich tool descriptions |
| `skills/napkin/SKILL.md` | Delete |
| `src/server/mcp.test.ts` | Add test for the new prompt |
