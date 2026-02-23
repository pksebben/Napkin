import path from "path";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";

declare const __IS_BUNDLE__: boolean;
declare const __NAPKIN_VERSION__: string;

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
  if (typeof __NAPKIN_VERSION__ !== "undefined") {
    return __NAPKIN_VERSION__;
  }
  // Fallback for dev mode: read package.json
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf-8"));
  return pkg.version;
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
