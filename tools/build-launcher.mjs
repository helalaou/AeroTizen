import { parse } from "acorn";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { build } from "vite";

import { markDevBuild } from "./dev-build-badge.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({ options: { dev: { type: "boolean" } } });
const name = values.dev ? "launcher-dev" : "launcher";
const output = path.join(root, "dist", name);

async function verifyScripts(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) {
      await verifyScripts(file);
    } else if (item.name.endsWith(".js")) {
      // Syntax check only. APIs and physical TV behaviour need separate tests.
      parse(await readFile(file, "utf8"), { ecmaVersion: 2018, sourceType: "script" });
    }
  }
}

const result = await build({
  configFile: path.join(root, "vite.config.mts"),
  mode: values.dev ? "tv-dev" : "production",
});
// Record rendered modules outside the TV runtime, so CI can verify tree shaking.
const rendered = new Set();
for (const buildResult of Array.isArray(result) ? result : [result]) {
  for (const chunk of buildResult.output) {
    if (chunk.type !== "chunk") continue;
    for (const [id, module] of Object.entries(chunk.modules)) {
      if (id.replaceAll("\\", "/").includes("/launcher/src/dev/") && module.renderedLength > 0) {
        throw new Error(`Development preview code cannot enter the TV package: ${path.relative(root, id)}`);
      }
      const icon = id.replaceAll("\\", "/").match(/\/lucide-preact\/dist\/esm\/icons\/([^/]+)\.mjs$/);
      if (icon && module.renderedLength > 0) rendered.add(icon[1]);
    }
  }
}
const iconRoot = path.join(root, "node_modules/lucide-preact");
const iconPackage = JSON.parse(await readFile(path.join(iconRoot, "package.json"), "utf8"));
const available = (await readdir(path.join(iconRoot, "dist/esm/icons"))).filter((file) => file.endsWith(".mjs")).length;
await writeFile(
  path.join(root, "dist", `${name}-icons.json`),
  JSON.stringify(
    {
      package: iconPackage.name,
      version: iconPackage.version,
      available,
      rendered: [...rendered].sort(),
    },
    null,
    2,
  ) + "\n",
);
console.log(`Lucide: ${rendered.size} of ${available} icon modules retained.`);
const digest = createHash("sha256");
async function identify(directory) {
  for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  })) {
    const file = path.join(directory, item.name);
    const name = path.relative(output, file).split(path.sep).join("/");
    if (item.isDirectory()) await identify(file);
    else if (name !== "js/build-info.js")
      digest
        .update(name + "\0")
        .update(await readFile(file))
        .update("\0");
  }
}
await identify(output);
const metadata = {
  version: (await readFile(path.join(output, "config.xml"), "utf8")).match(/version="([0-9]+\.[0-9]+\.[0-9]+)"/)[1],
  build_id: digest.digest("hex"),
  commit: null,
  dirty: null,
};
try {
  metadata.commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    timeout: 2000,
  }).trim();
  metadata.dirty = !!execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
    cwd: root,
    encoding: "utf8",
    timeout: 2000,
  }).trim();
} catch {
  /* content identity remains available outside Git */
}
await writeFile(
  path.join(output, "js/build-info.js"),
  "/* global module */\n(function(root){var value=" +
    JSON.stringify(metadata) +
    ';if(typeof module!=="undefined"&&module.exports){module.exports=value;}else{root.AeroBuildInfo=value;}})(typeof window!=="undefined"?window:this);\n',
);
if (values.dev) {
  const label = await markDevBuild(output, metadata.build_id);
  console.log(`TV app name: ${label}`);
}
await verifyScripts(output);
console.log(`Built ${output} for Chromium 69; shipped scripts parse as ES2018.`);
