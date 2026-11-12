const { loadTypeScript } = require("./load_typescript.cjs");
const { createNativeNavigation } = loadTypeScript("launcher/src/platform/tizen/createNativeNavigation.ts");

// The same adapter and composition bridge as the production entry, without a DOM.
exports.installNativeNavigation = (context) => {
  const window = context.window;
  const runtime = window.AeroTizen;
  const navigation = createNativeNavigation({
    ...window,
    document: context.document,
    XMLHttpRequest: context.XMLHttpRequest,
  });
  runtime.nativeNavigation = navigation;
  runtime.homewatch = { ...runtime.homewatch, ...navigation.commands };
  navigation.start();
  return navigation;
};
