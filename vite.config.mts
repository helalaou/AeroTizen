import preact from "@preact/preset-vite";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("./", import.meta.url));
const source = path.join(root, "launcher");
const output = path.join(root, "dist/launcher");

// Copy the explicit production page and runtime assets; source views are bundled separately.
const widgetAssets: Plugin = {
  name: "aerotizen-widget-assets",
  apply: "build",
  async buildStart() {
    await rm(output, { recursive: true, force: true });
    await cp(source, output, {
      recursive: true,
      filter: (file) => file !== path.join(source, "src"),
    });
    await mkdir(path.join(output, "licenses"), { recursive: true });
    await cp(path.join(root, "node_modules/preact/LICENSE"), path.join(output, "licenses/preact.txt"));
    await cp(path.join(root, "node_modules/i18next/LICENSE"), path.join(output, "licenses/i18next.txt"));
    // Includes Lucide's ISC terms and the inherited Feather MIT notice.
    await cp(path.join(root, "node_modules/lucide-preact/LICENSE"), path.join(output, "licenses/lucide-preact.txt"));
  },
};

const developmentEntry: Plugin = {
  name: "aerotizen-development-entry",
  apply: "serve",
  transformIndexHtml: {
    order: "pre",
    handler(html) {
      return html
        .replace('<script src="js/launcher-ui.js"></script>', "")
        .replace('<script src="js/main.js"></script>', '<script type="module" src="/src/dev.ts"></script>');
    },
  },
};

export default defineConfig({
  root: source,
  base: "./",
  publicDir: false,
  plugins: [preact({ devToolsEnabled: false }), widgetAssets, developmentEntry],
  server: { host: "0.0.0.0", port: 8019, strictPort: true },
  build: {
    target: ["chrome69", "es2018"],
    outDir: path.join(output, "js"),
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: path.join(source, "src/index.ts"),
      name: "AeroTizenLauncher",
      formats: ["iife"],
      fileName: () => "launcher-ui.js",
    },
  },
});
