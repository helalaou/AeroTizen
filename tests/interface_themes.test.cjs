const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");

const css = path.resolve(__dirname, "../launcher/css");
const sheets = readdirSync(css)
  .filter((file) => /^theme-.+\.css$/.test(file))
  .map((file) => ({
    id: file.slice("theme-".length, -".css".length),
    text: readFileSync(path.join(css, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, ""),
  }));
const rules = (text) =>
  [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, declarations]) => ({
    selectors: selectors.split(",").map((selector) => selector.trim()),
    variables: [...declarations.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map(([, name]) => name),
  }));
const ownVariables = ({ id, text }) =>
  rules(text)
    .filter(({ selectors }) => selectors.length === 1 && selectors[0] === `body[data-theme="${id}"]`)
    .flatMap(({ variables }) => variables);

test("the launcher page links every theme sheet and starts on Classic", () => {
  const page = readFileSync(path.resolve(__dirname, "../launcher/index.html"), "utf8");
  assert.ok(sheets.length >= 3);
  for (const { id } of sheets) assert.match(page, new RegExp(`href="css/theme-${id}\\.css"`), id);
  assert.match(page, /<body data-theme="classic">/);
});

test("a theme sheet only styles its own theme", () => {
  for (const { id, text } of sheets) {
    for (const { selectors } of rules(text)) {
      for (const selector of selectors) assert.ok(selector.includes(`body[data-theme="${id}"]`), `${id}: ${selector}`);
    }
  }
});

test("every theme sets the same variables itself, so none depends on another", () => {
  const classic = ownVariables(sheets.find(({ id }) => id === "classic"));
  assert.ok(classic.length > 100);
  for (const sheet of sheets) {
    const own = new Set(ownVariables(sheet));
    assert.deepEqual(
      classic.filter((name) => !own.has(name)),
      [],
      sheet.id,
    );
  }
});
