const assert = require("node:assert/strict");
const { test } = require("node:test");

const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { catalogues } = loadTypeScript("launcher/src/shared/i18n/catalogues.ts");
const { messages: english } = catalogues.en;
const placeholders = (text) => [...text.matchAll(/\{\{\s*([^}, ]+)/g)].map((match) => match[1]).sort();

test("registered translations cover English message keys and preserve placeholders", () => {
  for (const [language, { messages }] of Object.entries(catalogues)) {
    assert.equal(Intl.getCanonicalLocales(language)[0], language, "use canonical catalogue tags");
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(english).sort(), language);
    for (const [key, text] of Object.entries(messages)) {
      assert.ok(typeof text === "string" && text.trim(), `${language}: ${key} is empty`);
      assert.deepEqual(placeholders(text), placeholders(english[key]), `${language}: ${key}`);
    }
  }
});
