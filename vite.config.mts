import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('./', import.meta.url));
const source = path.join(root, 'launcher');
const output = path.join(root, 'dist/launcher');

const settingsHtml = (html: string): string => {
  const editor = /<div id="editor" class="sheet" hidden>[\s\S]*?(?= {2}<div id="fireplace")/;
  if (!editor.test(html)) {
    throw new Error('Cannot find the Settings mount point.');
  }
  return html.replace(editor, '<div id="settings-root"></div>\n\n')
    .replace(/ {2}<!-- Layout inspired[\s\S]*?(?= {2}<div id="settings-root")/, '  <div id="home-root"></div>\n\n')
    .replace('  <script src="js/home-screen.js"></script>\n', '')
    .replace('</head>', '  <link rel="stylesheet" href="css/preact-home.css">\n</head>')
    .replace('  <script src="js/continue-row.js"></script>\n', '');
};

// Keep the existing widget files and script order. Vite owns the Settings bundle.
const widgetAssets: Plugin = {
  name: 'aerotizen-widget-assets',
  apply: 'build',
  async buildStart() {
    await rm(output, { recursive: true, force: true });
    await cp(source, output, { recursive: true, filter: file => file !== path.join(source, 'src') });
    await writeFile(path.join(output, 'index.html'), settingsHtml(await readFile(path.join(source, 'index.html'), 'utf8')));
    await mkdir(path.join(output, 'licenses'), { recursive: true });
    await cp(path.join(root, 'node_modules/preact/LICENSE'), path.join(output, 'licenses/preact.txt'));
  }
};

const developmentEntry: Plugin = {
  name: 'aerotizen-development-entry',
  apply: 'serve',
  transformIndexHtml: {
    order: 'pre',
    handler(html) {
      return settingsHtml(html)
        .replace('  <script src="js/settings-ui.js"></script>\n', '')
        .replace('<script src="js/main.js"></script>', '<script type="module" src="/src/settings/dev.ts"></script>');
    }
  }
};

export default defineConfig({
  root: source,
  base: './',
  publicDir: false,
  plugins: [preact({ devToolsEnabled: false }), widgetAssets, developmentEntry],
  server: { host: '0.0.0.0', port: 8019, strictPort: true },
  build: {
    target: ['chrome69', 'es2018'],
    outDir: path.join(output, 'js'),
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: path.join(source, 'src/index.ts'),
      name: 'AeroTizenSettings',
      formats: ['iife'],
      fileName: () => 'settings-ui.js'
    }
  }
});
