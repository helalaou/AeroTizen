import { build, context } from 'esbuild';
import { parse } from 'acorn';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'launcher');
const output = path.join(root, 'dist/launcher');
const watching = process.argv.includes('--serve');

await rm(output, { recursive: true, force: true });
await cp(source, output, {
  recursive: true,
  filter: file => file !== path.join(source, 'src')
});

const html = await readFile(path.join(source, 'index.html'), 'utf8');
const editor = /<div id="editor" class="sheet" hidden>[\s\S]*?(?= {2}<div id="fireplace")/;
if (!editor.test(html)) {
  throw new Error('Cannot find the Settings mount point.');
}
await writeFile(path.join(output, 'index.html'), html.replace(editor,
  '<div id="editor" class="sheet" hidden></div>\n\n'));
await mkdir(path.join(output, 'licenses'), { recursive: true });
await cp(path.join(root, 'node_modules/preact/LICENSE'), path.join(output, 'licenses/preact.txt'));

const options = {
  entryPoints: [path.join(source, 'src/settings/index.jsx')],
  outfile: path.join(output, 'js/settings-ui.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome69', 'es2018'],
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  minify: true,
  legalComments: 'eof',
  define: { 'process.env.NODE_ENV': '"production"' }
};

async function verifyScripts(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) {
      await verifyScripts(file);
    } else if (item.name.endsWith('.js')) {
      // Syntax check only. CSS, APIs and physical TV behaviour need separate tests.
      parse(await readFile(file, 'utf8'), { ecmaVersion: 2018, sourceType: 'script' });
    }
  }
}

if (watching) {
  const server = await context(options);
  await server.watch();
  const { port, hosts } = await server.serve({ servedir: output, host: '0.0.0.0', port: 8019 });
  console.log(`Preact Settings: http://localhost:${port}`);
  hosts.filter(host => host !== '127.0.0.1').forEach(host => console.log(`Network: http://${host}:${port}`));
  console.log('JSX changes rebuild automatically. Restart after changing legacy HTML, CSS or scripts.');
} else {
  await build(options);
  await verifyScripts(output);
  console.log(`Built ${output} for Chromium 69; shipped scripts parse as ES2018.`);
}
