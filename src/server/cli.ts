#!/usr/bin/env node

import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const command = process.argv[2];

if (command === "mcp" || !command) {
  // Start the MCP server (dormant mode)
  await import("./index.js");
} else if (command === "install") {
  const bundlePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../dist/napkin.cjs"
  );

  try {
    execSync(`claude mcp remove napkin 2>/dev/null; claude mcp add --scope user napkin -- node ${bundlePath}`, {
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
