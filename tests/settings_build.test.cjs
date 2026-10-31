const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync, readdirSync, existsSync } = require('node:fs');
const path = require('node:path');
const { parse } = require('acorn');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist/launcher');
const read = (base, file) => readFileSync(path.join(base, file), 'utf8');
execFileSync(process.execPath, ['tools/build-launcher.mjs'], { cwd: root });

test('compiled Settings ships local scripts, a mount point and the Preact license', () => {
  const html = read(output, 'index.html');
  assert.match(html, /<div id="settings-root"><\/div>/);
  assert.doesNotMatch(html, /type="module"|https?:[^"']+\.js|@vite\/client|src\/settings/);
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
  assert.ok(scripts.includes('js/settings-ui.js'));
  for (const file of scripts) {
    assert.ok(existsSync(path.join(output, file)), file);
    parse(read(output, file), { ecmaVersion: 2018, sourceType: 'script' });
  }
  assert.equal(existsSync(path.join(output, 'src')), false, 'TypeScript source is not a TV runtime asset');
  assert.doesNotMatch(read(output, 'js/settings-ui.js'), /@vite\/client|@prefresh|preact\/debug/);
  assert.match(read(output, 'licenses/preact.txt'), /MIT License/);
  assert.notEqual(read(output, 'js/settings-ui.js'), read(path.join(root, 'launcher'), 'js/settings-ui.js'));
});

test('Settings compilation preserves all other runtime scripts, CSS, service and app identity', () => {
  for (const directory of ['js', 'css', 'service']) {
    for (const file of readdirSync(path.join(root, 'launcher', directory))) {
      if (directory === 'js' && ['settings-ui.js', 'build-info.js'].includes(file)) { continue; }
      assert.equal(read(output, `${directory}/${file}`), read(path.join(root, 'launcher'), `${directory}/${file}`));
    }
  }
  assert.equal(read(output, 'config.xml'), read(path.join(root, 'launcher'), 'config.xml'));
});


test('shipped UI and service share a content build identity without local paths', () => {
  const info = require(path.join(output, 'js/build-info.js'));
  assert.match(info.build_id, /^[a-f0-9]{64}$/);
  assert.match(info.version, /^\d+\.\d+\.\d+$/);
  assert.match(info.commit, /^[a-f0-9]{40,64}$/);
  assert.equal(typeof info.dirty, 'boolean');
  assert.deepEqual(Object.keys(info).sort(), ['build_id', 'commit', 'dirty', 'version']);
  assert.ok(read(output, 'index.html').indexOf('js/build-info.js') < read(output, 'index.html').indexOf('js/diagnostics.js'));
});
