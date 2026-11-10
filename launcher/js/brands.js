// App presentation data shared by the typed views. DOM constructors are test fixtures.
(function (A) {
  "use strict";

  function shortName(name) {
    return name.replace(/ - .*/, "").replace(/NextGeneration$/, "");
  }

  // Both screens consume presentation data; neither needs legacy SVG strings.
  function describe(app) {
    return {
      title: shortName(app.name),
      artwork: A.artwork.sources(app),
    };
  }

  A.tiles = { shortName: shortName, describe: describe };
})(window.AeroTizen);
