import * as esbuild from "esbuild";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const watch = process.argv.includes("--watch");

await mkdir("dist", { recursive: true });
await mkdir("dist/webviews", { recursive: true });

/** Discover webview entrypoints: src/webviews/<name>/main.ts */
async function webviewEntries() {
  const root = "src/webviews";
  try {
    const dirs = await readdir(root, { withFileTypes: true });
    const entries = {};
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const main = path.join(root, d.name, "main.ts");
      try {
        await readdir(path.join(root, d.name));
        entries[d.name] = main;
      } catch {
        // skip
      }
    }
    return entries;
  } catch {
    return {};
  }
}

const entries = await webviewEntries();

const extensionCtx = await esbuild.context({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  sourcesContent: false,
  logLevel: "info",
});

const webviewCtx =
  Object.keys(entries).length > 0
    ? await esbuild.context({
        entryPoints: entries,
        bundle: true,
        outdir: "dist/webviews",
        entryNames: "[name]",
        format: "iife",
        platform: "browser",
        target: "es2020",
        sourcemap: true,
        sourcesContent: false,
        logLevel: "info",
      })
    : null;

if (watch) {
  await extensionCtx.watch();
  if (webviewCtx) await webviewCtx.watch();
  console.log("watching extension + webviews…");
} else {
  await extensionCtx.rebuild();
  await extensionCtx.dispose();
  if (webviewCtx) {
    await webviewCtx.rebuild();
    await webviewCtx.dispose();
  }
}
