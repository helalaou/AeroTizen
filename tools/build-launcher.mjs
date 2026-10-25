import { build } from 'vite';
import { parse } from 'acorn';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
await verifyScripts(output);
console.log(`Built ${output} for Chromium 69; shipped scripts parse as ES2018.`);
