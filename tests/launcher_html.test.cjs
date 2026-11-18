const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { JSDOM } = require("jsdom");

const TEXT_ATTRIBUTES = [
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "label",
  "placeholder",
  "title",
];

test("the production HTML shell contains no untranslated launcher copy", () => {
  const dom = new JSDOM(readFileSync(path.join(__dirname, "../launcher/index.html"), "utf8"));
  try {
    const doc = dom.window.document;
    assert.equal(doc.title, "AeroTizen");
    assert.equal(doc.body.textContent.trim(), "");
    for (const element of doc.querySelectorAll(TEXT_ATTRIBUTES.map((name) => "[" + name + "]").join(","))) {
      for (const name of TEXT_ATTRIBUTES) {
        assert.ok(!element.getAttribute(name)?.trim(), `${element.tagName} has untranslated ${name}`);
      }
    }
  } finally {
    dom.window.close();
  }
});
