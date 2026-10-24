'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../tools/native-home-compatibility');
const source = fs.readFileSync(path.join(root, 'NativeHomeQuery.cs'), 'utf8');
const project = fs.readFileSync(path.join(root, 'NativeHomeQuery.csproj'), 'utf8');

test('generic native HOME query contains zero mutation entrypoints', () => {
  assert.doesNotMatch(source, /app_operation_set_current_app|vconf_set_str|vconf_set_int/);
  assert.doesNotMatch(source, /DllImport\("libcapi-appfw-app-operation-tv/);
  assert.doesNotMatch(source, /Process\.Start|subprocess|system\(/);
  assert.match(source, /WRITE_AUTHORIZED=NO/);
});

test('read-only helper requires SDK UID 901 and native ARM32 runtime', () => {
  assert.match(source, /IntPtr\.Size != 4 \|\| getuid\(\) != 901/);
  assert.match(source, /NativeLibrary\.TryLoad/);
  assert.match(source, /NativeLibrary\.Free/);
  assert.match(source, /File\.Exists\("\/etc\/prd_info\.ini"\)/);
});

test('helper only accepts query and emits a bounded complete status', () => {
  assert.match(source, /args\.Length != 1 \|\| args\[0\] != "query"/);
  for (const key of ['home_appid', 'startup_appid', 'booting_appid_backup',
    'first_screen/type', 'auto_start', 'main_operation']) {
    assert.match(source, new RegExp(key.replace('/', '\\/')));
  }
  assert.match(source, /NATIVE_HOME_READ_ONLY_BEGIN/);
  assert.match(source, /NATIVE_HOME_READ_ONLY_COMPLETE/);
  assert.match(source, /finally \{ free\(app\); \}/);
  assert.match(source, /finally \{ free\(value\); \}/);
});

test('generic inspector builds separately from S90C write helper', () => {
  assert.match(project, /<TargetFramework>net6\.0<\/TargetFramework>/);
  assert.match(project, /<AssemblyName>NativeHomeQuery<\/AssemblyName>/);
  assert.doesNotMatch(source, /CONFIRM_S90C_HOME|RESTORE_SAMSUNG/);
});
