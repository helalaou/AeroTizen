import { build } from 'vite';
import { parse } from 'acorn';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist/launcher');

async function verifyScripts(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) {
      await verifyScripts(file);
    } else if (item.name.endsWith('.js')) {
      // Syntax check only. APIs and physical TV behaviour need separate tests.
      parse(await readFile(file, 'utf8'), { ecmaVersion: 2018, sourceType: 'script' });
    }
  }
}

await build({ configFile: path.join(root, 'vite.config.mts') });
const digest = createHash('sha256');
async function identify(directory) {
  for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const file = path.join(directory, item.name), name = path.relative(output, file).split(path.sep).join('/');
    if (item.isDirectory()) await identify(file);
    else if (name !== 'js/build-info.js') digest.update(name + '\0').update(await readFile(file)).update('\0');
  }
}
await identify(output);
const metadata = { version: (await readFile(path.join(output, 'config.xml'), 'utf8')).match(/version="([0-9]+\.[0-9]+\.[0-9]+)"/)[1],
  build_id: digest.digest('hex'), commit: null, dirty: null };
try {
  metadata.commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 2000 }).trim();
  metadata.dirty = !!execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8', timeout: 2000 }).trim();
} catch { /* content identity remains available outside Git */ }
await writeFile(path.join(output, 'js/build-info.js'),
  '/* global module */\n(function(root){var value=' + JSON.stringify(metadata) +
  ';if(typeof module!=="undefined"&&module.exports){module.exports=value;}else{root.AeroBuildInfo=value;}})(typeof window!=="undefined"?window:this);\n');
await verifyScripts(output);
console.log(`Built ${output} for Chromium 69; shipped scripts parse as ES2018.`);
