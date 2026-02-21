#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const command = process.argv[2];

if (command === "mcp") {
  // Start the MCP server (dormant mode)
  await import("./index.js");
} else if (command === "install") {
  const projectDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.."
  );

  // Create wrapper script that cd's into project dir before running
  const wrapperPath = path.join(projectDir, "napkin-mcp.sh");
  const wrapperContent = `#!/bin/bash\ncd ${projectDir} && npx tsx src/server/index.ts\n`;
  fs.writeFileSync(wrapperPath, wrapperContent, { mode: 0o755 });

  // Register with Claude Code via CLI (user scope = available globally)
  try {
    execSync(`claude mcp remove napkin 2>/dev/null; claude mcp add --scope user napkin -- ${wrapperPath}`, {
      stdio: "inherit",
    });
    console.log("Napkin MCP server registered. Restart Claude Code to activate.");
  } catch {
    console.error("Failed to register via 'claude mcp add'. Is Claude Code installed?");
    process.exit(1);
  }
} else {
  console.log("Usage:");
  console.log("  napkin mcp       Start the MCP server (used by Claude Code)");
  console.log("  napkin install   Add Napkin to Claude Code's MCP config");
}
