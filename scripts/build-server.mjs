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
