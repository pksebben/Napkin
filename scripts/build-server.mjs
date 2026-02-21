import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/server/index.ts"],
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
  },
  external: ["bufferutil", "utf-8-validate"],
});

console.log("Server bundle built: dist/napkin.cjs");
