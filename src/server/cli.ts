#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const command = process.argv[2];

if (command === "mcp") {
  // Start the MCP server (dormant mode)
  await import("./index.js");
} else if (command === "install") {
  // Add napkin to .claude/mcp.json
  const claudeDir = path.join(os.homedir(), ".claude");
  const mcpJsonPath = path.join(claudeDir, "mcp.json");

  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  let mcpConfig: Record<string, unknown> = { mcpServers: {} };
  if (fs.existsSync(mcpJsonPath)) {
    mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, "utf-8"));
    if (!mcpConfig.mcpServers) {
      mcpConfig.mcpServers = {};
    }
  }

  const projectDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.."
  );

  (mcpConfig.mcpServers as Record<string, unknown>).napkin = {
    command: "npx",
    args: ["tsx", path.join(projectDir, "src/server/index.ts")],
  };

  fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2) + "\n");
  console.log(`Napkin added to ${mcpJsonPath}`);
  console.log("Restart Claude Code to activate.");
} else {
  console.log("Usage:");
  console.log("  napkin mcp       Start the MCP server (used by Claude Code)");
  console.log("  napkin install   Add Napkin to Claude Code's MCP config");
}
