// App presentation data shared by the typed views. DOM constructors are test fixtures.
(function (A) {
  "use strict";

  function shortName(name) {
    return name.replace(/ - .*/, "").replace(/NextGeneration$/, "");
  }

  function brandFor(app) {
    var known = A.catalog.brand(app);
    if (known) {
      return known;
    }
    var name = app.name,
      n = name.toLowerCase();
    // Preserve the original icon and generated background for unknown apps.
    var h = 0;
    for (var j = 0; j < n.length; j++) {
      h = (h * 31 + n.charCodeAt(j)) % 360;
    }
    return {
      background: "linear-gradient(135deg,hsl(" + h + ",55%,42%),hsl(" + ((h + 40) % 360) + ",65%,14%))",
      logo: null,
      label: shortName(name),
      textColour: "#ffffff",
      useAppIcon: true,
    };
  }

  // Both screens consume presentation data; neither needs legacy SVG strings.
  function describe(app) {
    var brand = brandFor(app),
      logo = brand.logo && window.LOGOS && window.LOGOS[brand.logo.slug];
    return {
      title: shortName(app.name),
      background: brand.background,
      label: brand.label,
      textColour: brand.textColour,
      logoPath: logo || null,
      logoColour: brand.logoColour || "#fff",
      largeLogo: !!brand.largeLogo,
      useAppIcon: !!brand.useAppIcon,
      artwork: A.artwork.sources(app),
    };
  }

  A.tiles = { shortName: shortName, describe: describe };
})(window.AeroTizen);
