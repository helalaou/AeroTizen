const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Linter } = require("eslint");

const rule = require("../tools/translation-lint.cjs");

const verify = (code, filename = "launcher/src/example.jsx") =>
  new Linter().verify(
    code,
    {
      files: ["**/*.{js,jsx}"],
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { launcher: { rules: { translation: rule } } },
      rules: { "launcher/translation": "error" },
    },
    { filename },
  );

test("translation lint catches bypasses and unknown keys in launcher UI", () => {
  const jsx = `<><p aria-label="Settings">Open</p>{show && ("Failed " + name)}</>`;
  assert.deepEqual(
    verify(jsx).map((issue) => issue.messageId),
    ["rawCopy", "rawCopy", "rawCopy"],
  );
  const options = 'const options = [{value: "all", label: "All ports"}, {labelKey: "inputs.missing"}];';
  assert.deepEqual(
    verify(options).map((issue) => issue.messageId),
    ["rawCopy", "unknownKey"],
  );
  const legacy =
    'A.toast("Could not open " + name); A.translate("handoff.missing"); A.translate(key); cw.messageKey = ready ? "continue.missing" : "";';
  assert.deepEqual(
    verify(legacy, "launcher/js/example.js").map((issue) => issue.messageId),
    ["rawCopy", "unknownKey", "legacyKey", "unknownKey"],
  );
  assert.deepEqual(verify('<p title={t("common.settings")} data-key="settings">{name}</p>'), []);
});
