const assert = require("node:assert/strict");
const { test } = require("node:test");

const { loadTypeScript } = require("./helpers/load_typescript.cjs");
const { catalogues, resolveLanguage } = loadTypeScript("launcher/src/shared/i18n/catalogues.ts");
const { createTranslations } = loadTypeScript("launcher/src/shared/i18n/createTranslations.ts");

test("Italian uses the shared catalogue, locale resolution and interpolation", () => {
  assert.equal(catalogues.it.name, "Italiano");
  assert.equal(resolveLanguage("auto", ["it-IT"]), "it");
  assert.equal(resolveLanguage("auto", ["it"]), "it");
  assert.equal(resolveLanguage("it", ["en-US"]), "it");
  assert.equal(resolveLanguage("auto", ["de-DE"]), "en");
  assert.equal(resolveLanguage("ru", ["it-IT"]), "ru");
  const translations = createTranslations("it");
  assert.equal(
    translations.getSnapshot().t("weather.location", { location: "Sassari <Centro>" }),
    "Località: Sassari <Centro>",
  );
  assert.equal(
    translations.getSnapshot().t("apps.openFailedDetail", { name: "My App", reason: "test" }),
    "Impossibile aprire My App: test",
  );
  translations.setLanguage("en");
  assert.equal(translations.getSnapshot().t("common.settings"), "Settings");
});
