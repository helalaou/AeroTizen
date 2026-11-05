const { loadTypeScript } = require("./load_typescript.cjs");

const { createTranslations } = loadTypeScript("launcher/src/shared/i18n/createTranslations.ts");
exports.translateEnglish = createTranslations("en").getSnapshot().t;
