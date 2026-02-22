import path from "path";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

declare const __IS_BUNDLE__: boolean;

function getBundlePath(): string {
  if (typeof __IS_BUNDLE__ !== "undefined" && __IS_BUNDLE__) {
    return path.resolve(__dirname, "napkin.cjs");
  }
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../dist/napkin.cjs"
  );
}

function installGlobalLink(bundlePath: string): boolean {
  const binDir = path.join(os.homedir(), ".local", "bin");
  const linkPath = path.join(binDir, "napkin");

  fs.mkdirSync(binDir, { recursive: true });

  // Remove existing link/file if present
  try { fs.unlinkSync(linkPath); } catch {}

  fs.symlinkSync(bundlePath, linkPath);
  console.log(`Linked: ${linkPath} -> ${bundlePath}`);

  // Check if ~/.local/bin is on PATH
  const pathDirs = (process.env.PATH || "").split(path.delimiter);
  if (!pathDirs.includes(binDir)) {
    console.log(`\nNote: ${binDir} is not on your PATH.`);
    console.log(`Add it with:  export PATH="${binDir}:$PATH"`);
    console.log(`Then add that line to your shell profile (~/.bashrc, ~/.zshrc, etc.)\n`);
  }

  return true;
}

const command = process.argv[2];

if (command === "mcp" || !command) {
  // Start the MCP server (dormant mode)
  import("./index.js").catch((err) => {
    console.error("Failed to start MCP server:", err);
    process.exit(1);
  });
} else if (command === "install") {
  const bundlePath = getBundlePath();

  // Create ~/.local/bin/napkin symlink (no sudo required)
  try {
    installGlobalLink(bundlePath);
  } catch (err) {
    console.error("Failed to create symlink:", (err as Error).message);
    process.exit(1);
  }

  // Register with Claude Code using the global command
  try {
    execSync("claude mcp remove napkin --scope user >/dev/null 2>&1; claude mcp add --scope user napkin -- napkin mcp", {
      stdio: "inherit",
    });
    console.log("\nNapkin installed. Restart Claude Code to activate.");
  } catch {
    console.error("Failed to register via 'claude mcp add'. Is Claude Code installed?");
    process.exit(1);
  }
} else {
  console.log("Usage:");
  console.log("  napkin mcp       Start the MCP server (used by Claude Code)");
  console.log("  napkin install   Add Napkin to Claude Code's MCP config");
}
