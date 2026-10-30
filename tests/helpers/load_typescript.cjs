const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');

// Load pure TypeScript boundaries without starting Vite or a DOM emulator.
exports.loadTypeScript = entry => {
  const cache = new Map();
  const load = filename => {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const fallback = createRequire(filename);
    const requireLocal = specifier => {
      const target = path.resolve(path.dirname(filename), specifier + '.ts');
      return specifier.startsWith('.') && existsSync(target) ? load(target) : fallback(specifier);
    };
    const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2018, module: ts.ModuleKind.CommonJS }
    });
    new Function('module', 'exports', 'require', outputText)(module, module.exports, requireLocal);
    return module.exports;
  };
  return load(path.resolve(__dirname, '../..', entry));
};
