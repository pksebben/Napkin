import fs from "fs";
import path from "path";

const OUT = "plugin";

// Clean output directory
if (fs.existsSync(OUT)) {
  fs.rmSync(OUT, { recursive: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy each component into plugin/
copyDir(".claude-plugin", path.join(OUT, ".claude-plugin"));
copyDir("skills", path.join(OUT, "skills"));
copyDir("dist", path.join(OUT, "dist"));
fs.copyFileSync(".mcp.json", path.join(OUT, ".mcp.json"));

console.log("Plugin built: plugin/");
console.log("Contents:");
for (const entry of fs.readdirSync(OUT, { recursive: true, withFileTypes: true })) {
  if (!entry.isDirectory()) {
    const rel = path.join(entry.parentPath || entry.path, entry.name).replace(OUT + "/", "");
    console.log(`  ${rel}`);
  }
}
