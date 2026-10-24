'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const native = fs.readFileSync(
  path.join(__dirname, '../tools/native-home-s90c/S90CHomeBinding.cs'), 'utf8');
const docs = fs.readFileSync(
  path.join(__dirname, '../docs/physical-home-s90c.md'), 'utf8');
const project = fs.readFileSync(
  path.join(__dirname, '../tools/native-home-s90c/S90CHomeBinding.csproj'), 'utf8');

test('native physical HOME is a separate opt-in device feature, not HomeWatcher alone', () => {
  assert.match(docs, /native assignment/);
  assert.match(docs, /HomeWatcher/);
  assert.match(docs, /db\/appfw\/home_appid/);
  assert.match(docs, /main_operation/);
});
test('original Samsung and AeroTizen targets are exact fixed app IDs', () => {
  assert.match(native, /const string Samsung = "com\.samsung\.tv\.csfs"/);
  assert.match(native, /const string Aero = "DclHome001\.Home"/);
  assert.match(native, /http:\/\/tizen\.org\/appcontrol\/operation\/main/);
});
test('S90C native helper refuses incorrect firmware, UID or 64-bit architecture', () => {
  assert.match(native, /T-PTMCDEUC-0090-2220\.4/);
  assert.match(native, /getuid\(\) != 901/);
  assert.match(native, /IntPtr\.Size != 4/);
  assert.match(native, /Version=" \+ Firmware \+ ";"/);
  assert.match(docs, /model.*host/i);
});
test('native helper has explicit query with no write on query code path', () => {
  assert.match(native, /if \(query\) \{/);
  assert.match(native, /READ_ONLY_COMPLETE/);
  assert.match(native, /return 0;/);
});
test('apply checks original snapshot and boot eligibility and requires confirmation', () => {
  assert.match(native, /apply" &&/);
  assert.match(native, /CONFIRM_S90C_HOME/);
  assert.match(native, /if \(!Original\(before\)\)/);
  assert.match(native, /util_is_appbooting_supported_webapp_byappid\(Aero\)/);
});
test('restore requires distinct confirmation and does not change unknown states', () => {
  assert.match(native, /CONFIRM_SAMSUNG_RESTORE/);
  assert.match(native, /unknown state|unexpected state/i);
  assert.match(native, /SetBoth\(Samsung\)/);
});
test('only the two validated HOME setters are present', () => {
  const refs = [...native.matchAll(/vconf_set_str\(([^)]+)\)/g)].map(x => x[1]);
  assert.equal(refs.length, 2, 'one declaration and one guarded use');
  assert.match(refs[1], /HomeKey, app/);
  assert.doesNotMatch(native, /vconf_set_int/);
  assert.doesNotMatch(native, /vd_appinstall|vd_appuninstall|rm -rf|curl/);
  assert.doesNotMatch(native, /db\/appfw\/startup_appid"\s*,/);
});
test('no private device identifiers, baseline or compiled executable are committed', () => {
  const combined = native + docs;
  assert.doesNotMatch(combined, /192\.168\.|10\.0\.\d+\.\d+/);
  assert.doesNotMatch(combined, /\.pfx\b|\.wgt\b|DUID[=:]/);
  assert.match(project, /<TargetFramework>net6\.0<\/TargetFramework>/);
});
