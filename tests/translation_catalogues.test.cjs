const assert = require("node:assert/strict");
const { test } = require("node:test");

const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { FIXED_NAMES } = loadTypeScript("launcher/src/shared/fixedNames.ts");
const { catalogues } = loadTypeScript("launcher/src/shared/i18n/catalogues.ts");
const { createTranslations } = loadTypeScript("launcher/src/shared/i18n/createTranslations.ts");
const { messages: english } = catalogues.en;
const placeholders = (text) => [...text.matchAll(/\{\{\s*([^}, ]+)/g)].map((match) => match[1]).sort();
const dynamicPlaceholders = (text) => placeholders(text).filter((name) => !Object.hasOwn(FIXED_NAMES, name));
const fixedNamePattern = new RegExp(
  "\\b(?:" +
    Object.values(FIXED_NAMES)
      .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|") +
    ")\\b",
  "i",
);

test("registered translations cover English message keys and preserve dynamic placeholders", () => {
  for (const [language, { messages }] of Object.entries(catalogues)) {
    assert.equal(Intl.getCanonicalLocales(language)[0], language, "use canonical catalogue tags");
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(english).sort(), language);
    for (const [key, text] of Object.entries(messages)) {
      assert.ok(typeof text === "string" && text.trim(), `${language}: ${key} is empty`);
      assert.deepEqual(dynamicPlaceholders(text), dynamicPlaceholders(english[key]), `${language}: ${key}`);
    }
  }
});

test("all catalogues use shared fixed names and render without unresolved placeholders", () => {
  const translations = createTranslations("en");
  for (const [language, { messages }] of Object.entries(catalogues)) {
    translations.setLanguage(language);
    for (const [key, text] of Object.entries(messages)) {
      const literalText = text.replace(/\{\{[^}]+\}\}/g, "");
      assert.doesNotMatch(literalText, fixedNamePattern, `${language}: ${key} contains a fixed name`);
      const values = Object.fromEntries(dynamicPlaceholders(text).map((name) => [name, `<${name} & value>`]));
      const rendered = translations.getSnapshot().t(key, values);
      assert.doesNotMatch(rendered, /\{\{/, `${language}: ${key}`);
      for (const name of placeholders(text)) {
        assert.ok(rendered.includes(FIXED_NAMES[name] ?? values[name]), `${language}: ${key} lost ${name}`);
      }
    }
  }
});

test("fixed names work with caller values, language changes and the English fallback", () => {
  const translations = createTranslations("en");
  const version = "9.9.9 <test>";
  assert.equal(
    translations.getSnapshot().t("settings.about.installedVersion", { version }),
    `AeroTizen version: ${version}`,
  );
  assert.equal(translations.getSnapshot().t("handoff.watcherHttp", { status: 503 }), "HomeWatcher HTTP 503");
  assert.equal(translations.getSnapshot().t("network.signalUnavailable"), "Wi-Fi (signal unavailable)");

  translations.setLanguage("fr");
  assert.equal(translations.getSnapshot().t("common.samsungHome"), "Accueil Samsung");
  assert.equal(
    translations.getSnapshot().t("settings.about.installedVersion", { version }),
    `Version d’AeroTizen\u00a0: ${version}`,
  );

  translations.setLanguage("ar");
  assert.equal(translations.getSnapshot().t("common.samsungHome"), "واجهة Samsung الرئيسية");
  assert.equal(translations.getSnapshot().t("network.ethernet"), "إيثرنت");

  translations.setLanguage("de");
  assert.equal(
    translations.getSnapshot().t("settings.about.installedVersion", { version }),
    `AeroTizen version: ${version}`,
  );
});
