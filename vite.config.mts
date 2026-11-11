/// <reference types="vitest/config" />

import preact from "@preact/preset-vite";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { Plugin } from "vite";
import { build, defineConfig } from "vite";

const root = fileURLToPath(new URL("./", import.meta.url));
const source = path.join(root, "launcher");

const SERVICE_ENTRIES = {
  diagnostics: "diagnostics/service.ts",
  "diagnostics-context": "diagnostics/context.ts",
  "diagnostics-store": "diagnostics/storage.ts",
  "home-mode": "service/createHomeMode.ts",
  "home-store": "service/openHomeStore.ts",
  artmode: "service/createArtMode.ts",
  index: "service/index.ts",
} as const;
const EARLY_DIAGNOSTICS_ENTRY = "diagnostics/early.ts";
const BUILD_INFO_ENTRY = "buildInfo.ts";
const DEVELOPMENT_SCRIPTS: Readonly<Record<string, { entry: string; globalName?: string }>> = {
  "/js/build-info.js": { entry: BUILD_INFO_ENTRY, globalName: "AeroBuildInfo" },
  "/js/launcher-diagnostics.js": { entry: EARLY_DIAGNOSTICS_ENTRY },
};

const compileRuntimeScript = async ({
  entry,
  service = false,
  globalName = "AeroTizenDiagnostics",
}: {
  entry: string;
  globalName?: string;
  service?: boolean;
}) => {
  const result = await build({
    configFile: false,
    root,
    publicDir: false,
    logLevel: "silent",
    build: {
      write: false,
      target: ["chrome69", "es2018"],
      rolldownOptions: {
        external: [
          "fs",
          "http",
          "crypto",
          "url",
          ...Object.keys(SERVICE_ENTRIES).map((name) => "./" + name),
          "../js/build-info",
        ],
        output: { generatedCode: { preset: "es5", symbols: false } },
      },
      minify: !service,
      lib: {
        entry: path.join(source, "src", entry),
        formats: [service ? "cjs" : "iife"],
        name: globalName,
      },
    },
  });
  const builds = Array.isArray(result) ? result : [result];
  const chunk = builds.flatMap((item) => ("output" in item ? item.output : [])).find((item) => item.type === "chunk");
  if (!chunk) {
    throw new Error("Runtime build produced no script: " + entry);
  }
  if (!service) {
    return chunk.code;
  }
  // HomeWatcher runs in an older CommonJS service runtime. Keep its syntax at ES5.
  return ts.transpileModule(chunk.code, {
    compilerOptions: { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS, removeComments: true },
  }).outputText;
};

// Copy the explicit production page and runtime assets; source views are bundled separately.
const widgetAssets = (output: string): Plugin => ({
  name: "aerotizen-widget-assets",
  apply: "build",
  async buildStart() {
    await rm(output, { recursive: true, force: true });
    await cp(source, output, {
      recursive: true,
      filter: (file) => file !== path.join(source, "src"),
    });
    await mkdir(path.join(output, "js"), { recursive: true });
    await writeFile(
      path.join(output, "js/launcher-diagnostics.js"),
      await compileRuntimeScript({ entry: EARLY_DIAGNOSTICS_ENTRY }),
    );
    await mkdir(path.join(output, "service"), { recursive: true });
    for (const [filename, entry] of Object.entries(SERVICE_ENTRIES)) {
      await writeFile(
        path.join(output, "service", filename + ".js"),
        await compileRuntimeScript({ entry, service: true }),
      );
    }
    await mkdir(path.join(output, "licenses"), { recursive: true });
    await cp(path.join(root, "node_modules/preact/LICENSE"), path.join(output, "licenses/preact.txt"));
    await cp(path.join(root, "node_modules/i18next/LICENSE"), path.join(output, "licenses/i18next.txt"));
    // Includes Lucide's ISC terms and the inherited Feather MIT notice.
    await cp(path.join(root, "node_modules/lucide-preact/LICENSE"), path.join(output, "licenses/lucide-preact.txt"));
  },
});

const developmentEntry: Plugin = {
  name: "aerotizen-development-entry",
  apply: "serve",
  configureServer(server) {
    const scripts = new Map<string, Promise<string>>();
    const onChange = (file: string) => {
      if (
        file.startsWith(path.join(source, "src/diagnostics")) ||
        file === path.join(source, "src/contracts/diagnostics.ts") ||
        file === path.join(source, "src", BUILD_INFO_ENTRY)
      ) {
        scripts.clear();
        server.ws.send({ type: "full-reload" });
      }
    };
    server.watcher.on("change", onChange);
    server.httpServer?.once("close", () => server.watcher.off("change", onChange));
    server.middlewares.use((request, response, next) => {
      const pathname = request.url?.split("?")[0] ?? "";
      const entry = DEVELOPMENT_SCRIPTS[pathname];
      if (!entry) {
        next();
        return;
      }
      const script = scripts.get(pathname) ?? compileRuntimeScript(entry);
      scripts.set(pathname, script);
      void script
        .then((code) => {
          response.setHeader("Content-Type", "text/javascript");
          response.setHeader("Cache-Control", "no-cache");
          response.end(code);
        })
        .catch((error: unknown) => {
          if (scripts.get(pathname) === script) {
            scripts.delete(pathname);
          }
          next(error);
        });
    });
  },
  transformIndexHtml: {
    order: "pre",
    handler(html) {
      return html
        .replace('    <link rel="stylesheet" href="js/launcher-ui.css" />\n', "")
        .replace('<script src="js/launcher-ui.js"></script>', '<script type="module" src="/src/dev.ts"></script>');
    },
  },
};

export default defineConfig(({ mode }) => {
  const output = path.join(root, "dist", mode === "tv-dev" ? "launcher-dev" : "launcher");
  return {
    root: source,
    base: "./",
    publicDir: false,
    css: {
      transformer: "lightningcss",
      // Lightning CSS encodes major.minor.patch in three bytes, including in development.
      lightningcss: { targets: { chrome: 69 << 16 } },
    },
    plugins: [
      preact({
        devToolsEnabled: false,
        // The legacy runtime loads as classic scripts and cannot accept Prefresh imports.
        exclude: [/node_modules/, /\/launcher\/js\//],
      }),
      widgetAssets(output),
      developmentEntry,
    ],
    server: { host: "0.0.0.0", port: 8019, strictPort: true },
    test: {
      include: ["src/**/*.test.{ts,tsx}"],
      environment: "jsdom",
      setupFiles: ["src/test/setup.ts"],
    },
    build: {
      target: ["chrome69", "es2018"],
      cssTarget: "chrome69",
      outDir: path.join(output, "js"),
      emptyOutDir: false,
      minify: true,
      lib: {
        entry: path.join(source, "src/index.ts"),
        name: "AeroTizenLauncher",
        formats: ["iife"],
        fileName: () => "launcher-ui.js",
        cssFileName: "launcher-ui",
      },
    },
  };
});
