// Run by npm run test:browser against the compiled launcher.
// This uses real browser rendering and DOM key events, with weather requests mocked.
const runSettingsUi = async (page, { screenshotPath }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) errors.push(message.type() + ": " + message.text());
  });
  await page.route("https://**/*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        latitude: 0,
        longitude: 0,
        city: "Test location",
        country_code: "GB",
        current: { temperature_2m: 20, weather_code: 0 },
        results: [],
      }),
    }),
  );

  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
  await page.waitForFunction(() => window.AeroTizen && AeroTizen.apps.getSnapshot().all.length > 0);
  const check = await page.evaluate(async () => {
    const focusSelector = "[data-focused=true]";
    const A = AeroTizen,
      K = A.config.KEY;
    const preferences = () => A.settings.getSnapshot();
    const updatePreferences = (patch) => {
      A.settings.update(patch);
    };
    function assert(value, message) {
      if (!value) throw new Error(message);
    }
    function key(code) {
      for (const type of ["keydown", "keyup"]) {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, "keyCode", { value: code });
        document.dispatchEvent(event);
      }
    }
    function reveal(element) {
      const pane = element.closest("[data-section-pane]");
      if (
        pane &&
        (pane.hidden || document.querySelector("[data-settings-drawer=frame]").dataset.expanded === "false")
      ) {
        const entry = document.querySelector('[data-key="section:' + pane.dataset.sectionPane + '"]');
        // Category clicks use the same public controls as the physical drawer.
        entry.click();
        entry.focus();
      }
      if (element.closest("#weather-location-editor")?.hidden) {
        document.querySelector('[data-key="weather:change"]').click();
      }
      if (pane?.dataset.sectionPane === "wallpaper") {
        const group = element.closest("#bg-anim")
          ? "animated"
          : element.closest("#bg-still")
            ? element.dataset.key === "bg:black"
              ? "solid"
              : "gradient"
            : element.closest("#speed-row")
              ? "animated"
              : element.closest("#weather-photo-choice")
                ? "photo"
                : null;
        if (group) {
          const filter = document.querySelector('[data-key="wallpaper-categories:' + group + '"]');
          filter.click();
          filter.focus();
        }
      }
      return element;
    }
    function find(value) {
      const element = document.querySelector('#editor [data-key="' + value + '"]');
      assert(element, "missing control: " + value);
      return reveal(element);
    }
    function input(field, value) {
      reveal(field);
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
    // Allow the initial commit and passive store subscriptions to complete.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const before = JSON.stringify(preferences().home);
    // Use the real home -> gear -> OK -> Settings route.
    key(K.UP);
    for (let step = 0; step < 4 && !document.getElementById("gear").matches(focusSelector); step++) key(K.LEFT);
    assert(document.getElementById("gear").matches(focusSelector), "gear is reachable through the header controls");
    key(K.ENTER);

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    assert(A.settingsUi.isOpen(), "remote opens Settings");
    assert(document.querySelector("#editor " + focusSelector).dataset.key === "section:appearance", "initial focus");
    find("bg:aurora").click();
    assert(
      document.activeElement === document.querySelector("#editor " + focusSelector),
      "remote state and browser focus agree",
    );
    assert(
      document.querySelectorAll('#editor [data-key][tabindex="0"]').length === 1,
      "one remote control is in the tab order",
    );
    assert(document.querySelectorAll("#editor [data-key]").length >= 80, "all sections present");
    for (let i = 0; i < 10; i++) key(K.UP);
    assert(document.querySelectorAll("#editor " + focusSelector).length === 1, "top boundary keeps one focus");
    const weatherField = document.querySelector("#weather-location input");
    const appTile = find("app:" + A.apps.getSnapshot().all[0].id);
    find("time:24").click();
    assert(preferences().timeFormat === "24", "time setting updates");
    assert(weatherField === document.querySelector("#weather-location input"), "unrelated input identity retained");
    assert(appTile === find("app:" + A.apps.getSnapshot().all[0].id), "artwork node retained on clock change");
    assert(JSON.parse(localStorage.getItem(A.config.STORAGE_KEY)).timeFormat === "24", "setting persisted");
    find("time:none").click();
    assert(document.getElementById("time").hidden, "time hidden");
    find("time:24").click();
    assert(!document.getElementById("time").hidden, "time restored");
    find("weather-display:false").click();
    assert(document.getElementById("weather").hidden, "weather hidden");
    find("weather-display:true").click();
    find("network-visibility:false").click();
    assert(document.getElementById("network").hasAttribute("hidden"), "network hidden");
    find("network-visibility:true").click();
    assert(!document.getElementById("network").hasAttribute("hidden"), "network restored");
    find("live-tv-visibility:false").click();
    assert(preferences().showLiveTv === false, "Live TV hidden");
    find("home-card-columns:5").click();
    assert(preferences().homeCardColumns === 5, "apps per row saved");
    find("input-visibility:true").click();
    assert(
      !Array.from(document.querySelector("#inputs").children).some((el) => el.textContent === "HDMI 2"),
      "disconnected HDMI hidden",
    );
    let name = find("name:HDMI 1").querySelector("input");
    find("name:HDMI 1").click();
    input(name, "Test console");
    key(K.IME_DONE);
    assert(
      document.activeElement !== name && preferences().inputNames["HDMI 1"] === "Test console",
      "IME Done saves and restores navigation",
    );
    name = find("name:HDMI 1").querySelector("input");
    name.focus();
    input(name, "");
    name.blur();
    assert(!preferences().inputNames["HDMI 1"], "empty name restores TV label");
    const homeBeforeToggle = preferences().home.slice();
    find("app:" + A.config.FIREPLACE_ID).click();
    assert(preferences().home.indexOf(A.config.FIREPLACE_ID) < 0, "Fireplace can be hidden");
    find("app:" + A.config.FIREPLACE_ID).click();
    assert(preferences().home.length === homeBeforeToggle.length, "Fireplace can be restored");
    // Search callbacks cannot apply after editing or closing. No real geocoder call.
    const callbacks = [];
    const weather = A.weather;
    weather.searchLocations = (query, done) => {
      callbacks.push(done);
      return () => {};
    };
    let field = document.querySelector("#weather-location input");
    input(field, "Example");
    find("weather:search").click();
    field = document.querySelector("#weather-location input");
    input(field, "Changed");
    callbacks.shift()([{ label: "Stale", name: "Stale", latitude: 0, longitude: 0 }]);
    assert(!document.querySelector("#weather-results").textContent.includes("Stale"), "late query ignored");
    find("weather:search").click();
    callbacks.shift()([
      {
        label: "Test location",
        name: "Test location",
        latitude: 0,
        longitude: 0,
        country_code: "GB",
      },
    ]);
    find("weather:result:0").click();
    assert(preferences().weatherLocation.label === "Test location", "location selected");
    field = document.querySelector("#weather-location input");
    input(field, "Pending");
    find("weather:search").click();
    A.settingsUi.close();
    callbacks.shift()([{ label: "Closed search", latitude: 0, longitude: 0 }]);
    A.settingsUi.open();
    assert(!document.querySelector("#weather-results").textContent.includes("Closed search"), "closed search ignored");
    find("weather-visibility:false").click();
    assert(preferences().weatherShowLocation === false, "location visibility saved");
    find("preview").click();
    assert(document.body.classList.contains("previewing"), "preview opens");
    key(K.RIGHT);
    assert(!document.body.classList.contains("previewing"), "any key exits preview");
    assert(document.getElementById("toast").hidden, "preview exit hides its message");
    find("preview").click();
    A.settingsUi.open();
    assert(
      !document.body.classList.contains("previewing") && document.getElementById("toast").hidden,
      "open resets preview and its message together",
    );
    assert(
      document.activeElement === document.querySelector("#editor " + focusSelector),
      "preview return restores browser focus",
    );
    find("preview").click();
    A.settingsUi.close();
    assert(
      !document.body.classList.contains("editing") &&
        !document.body.classList.contains("previewing") &&
        document.getElementById("toast").hidden,
      "close clears all presentation state",
    );
    A.settingsUi.open();
    find("bg:black").click();
    assert(document.querySelector("#speed-row").hidden, "static background hides speed");
    find("bg:aurora").click();
    A.settingsUi.close();
    A.settingsUi.open();
    find("bg:aurora").click();
    for (let i = 0; i < 20 && document.querySelector("#editor " + focusSelector)?.dataset.key !== "speed"; i++)
      key(K.DOWN);
    assert(document.querySelector("#editor " + focusSelector).dataset.key === "speed", "remote reaches speed");
    // Without OK, Right moves on to Preview; Left comes back to the slider.
    const unchanged = preferences().speed;
    key(K.RIGHT);
    assert(document.querySelector("#editor " + focusSelector).dataset.key === "preview", "Right reaches Preview");
    assert(preferences().speed === unchanged, "moving past the slider keeps the speed");
    key(K.LEFT);
    assert(document.querySelector("#editor " + focusSelector).dataset.key === "speed", "Left returns to speed");
    // OK starts adjusting; Left/Right then change the speed.
    key(K.ENTER);
    assert(document.querySelector("#editor " + focusSelector).dataset.adjusting === "true", "OK starts adjusting");
    for (let i = 0; i < 30; i++) key(K.LEFT);
    assert(preferences().speed === A.config.SPEED.MIN, "speed lower bound");
    for (let i = 0; i < 30; i++) key(K.RIGHT);
    assert(preferences().speed === A.config.SPEED.MAX, "speed upper bound");
    key(K.ESC);
    assert(
      A.settingsUi.isOpen() && !document.querySelector("#editor [data-adjusting=true]"),
      "Back leaves the slider, not Settings",
    );
    find("app:" + A.apps.getSnapshot().all[0].id).click();
    for (let i = 0; i < 60; i++) key(K.DOWN);
    assert(document.querySelector("[data-settings-drawer=scroll]").scrollTop > 0, "focus scrolls apps into view");
    key(K.ESC);
    for (let i = 0; i < 60; i++) key(K.DOWN);
    assert(
      document.querySelector("#editor " + focusSelector).textContent.includes("Samsung Home"),
      "bottom row reachable",
    );
    key(K.ESC);
    assert(!A.settingsUi.isOpen(), "Back closes Settings");
    updatePreferences({ home: [] });
    A.homeScreen.render();
    A.settingsUi.open();
    A.settingsUi.close();
    assert(
      preferences().home.length === 0 && !document.querySelector("#grid").children.length,
      "empty Home stays empty",
    );
    updatePreferences({ home: JSON.parse(before) });
    updatePreferences({ background: "black" });
    updatePreferences({ speed: 1 });
    A.applyBackground();
    A.homeScreen.render();
    return {
      remote: true,
      persistence: true,
      staleSearch: true,
      preview: true,
      emptyHome: true,
    };
  });
  await page.evaluate(() => AeroTizen.settingsUi.open());
  await page.locator("#editor").waitFor({ state: "visible" });
  await page.screenshot({ path: screenshotPath, animations: "disabled" });
  await page.reload();
  if (
    !(await page.evaluate(() => {
      const state = AeroTizen.settings.getSnapshot();
      return state.timeFormat === "24" && state.weatherShowLocation === false;
    }))
  ) {
    throw new Error("Settings did not survive reload");
  }
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.route("**/opt/share/webappservice/apps_icon/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: route.request().url().endsWith("/304x304.png")
        ? "invalid image"
        : '<svg xmlns="http://www.w3.org/2000/svg" width="304" height="304"><rect width="304" height="304" fill="purple"/></svg>',
    }),
  );
  await page.addInitScript(() => {
    window.tizen = {
      application: {
        getAppsInfo(done) {
          done([{ id: "111299001912", name: "YouTube", packageId: "LBUAQX1exg" }]);
        },
        launch() {},
        launchAppControl() {},
      },
    };
  });
  await page.reload();
  await page.waitForFunction(() => AeroTizen.apps.getSnapshot().ready && AeroTizen.apps.getSnapshot().all.length === 1);
  await page.evaluate(() => {
    const A = AeroTizen;
    if (A.tiles || A.artwork) throw new Error("App presentation still depends on legacy globals");
    A.settingsUi.open();
  });
  await page.locator('[data-key="section:apps"]').click();
  // A real pointer click waits for the pane to render before selecting an app.
  await page.locator("#all-apps [data-app-option]").first().click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll("#all-apps [data-artwork-loaded=true]").length ===
      AeroTizen.apps.getSnapshot().all.length,
  );
  const artwork = await page.evaluate(() => {
    const tile = document.querySelector("#all-apps [data-app-option]");
    if (!tile.querySelector("[data-app-fallback]").hidden) throw new Error("Artwork did not replace fallback");
    if (!tile.matches("[data-focused=true]")) throw new Error("Artwork arrival removed remote focus");
    document.querySelector('[data-key="time:12"]').click();
    if (tile !== document.querySelector("#all-apps [data-app-option]")) throw new Error("Clock change rebuilt artwork");
    tile.click();
    if (tile !== document.querySelector("#all-apps [data-app-option]")) throw new Error("Selection rebuilt artwork");
    if (!tile.querySelector("[data-app-artwork]").src.endsWith("/250x250.png"))
      throw new Error("Artwork did not advance past the invalid primary image");
    return { asynchronous: true, fallback: true, stableOnClockAndSelection: true };
  });
  // External preference updates publish into the same Settings store.
  await page.evaluate(() => {
    AeroTizen.settings.update({ timeFormat: "24" });
    AeroTizen.settings.update({ inputNames: { "HDMI 1": "External name" } });
  });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-key="time:24"]').getAttribute("aria-pressed") === "true" &&
      document.querySelector('[data-key="name:HDMI 1"] input').value === "External name",
  );
  const lifecycle = await page.evaluate(async () => {
    const A = AeroTizen;
    const find = (key) => document.querySelector('#editor [data-key="' + key + '"]');
    const field = find("name:HDMI 1").querySelector("input");
    document.querySelector('[data-key="section:sources"]').click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    field.focus();
    field.value = "Local draft";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    A.settings.update({ inputNames: { "HDMI 1": "Concurrent value" } });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (field.value !== "Local draft") throw new Error("External update discarded an active draft");
    A.settingsUi.close();
    if (A.settings.getSnapshot().inputNames["HDMI 1"] !== "Local draft")
      throw new Error("Close did not commit active draft");
    A.settings.update({ inputNames: { "HDMI 1": "Changed while closed" } });
    A.settingsUi.open();
    if (field.value !== "Changed while closed") throw new Error("Reopen missed an external update");
    if (field !== find("name:HDMI 1").querySelector("input")) throw new Error("Reopen rebuilt the cached form");
    // A pending reply delivered after close + reopen must remain cancelled.
    const replies = [];
    AeroTizen.weather.searchLocations = (query, done) => {
      replies.push(done);
      return () => {};
    };
    document.querySelector('[data-key="section:weather"]').click();
    find("weather:change").click();
    const query = find("weather:query").querySelector("input");
    query.value = "Pending";
    query.dispatchEvent(new Event("input", { bubbles: true }));
    find("weather:search").click();
    A.settingsUi.close();
    A.settingsUi.open();
    replies.shift()([{ label: "Outdated result", name: "Outdated result", latitude: 0, longitude: 0 }]);
    if (document.querySelector("#weather-results").textContent.includes("Outdated result"))
      throw new Error("Reopen accepted an old reply");
    const original = A.settings.getSnapshot().speed;
    for (let i = 0; i < 10; i++) {
      A.settingsUi.close();
      A.settingsUi.open();
    }
    document.querySelector('[data-key="section:wallpaper"]').click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    document.querySelector('[data-key="wallpaper-categories:animated"]').click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    find("bg:aurora").click();
    find("speed").focus();
    for (const code of [A.config.KEY.ENTER, A.config.KEY.RIGHT]) {
      for (const type of ["keydown", "keyup"]) {
        document.dispatchEvent(new KeyboardEvent(type, { keyCode: code, bubbles: true, cancelable: true }));
      }
    }
    if (A.settings.getSnapshot().speed !== original + A.config.SPEED.STEP)
      throw new Error(
        "Repeated-open slider: " +
          JSON.stringify({
            before: original,
            after: A.settings.getSnapshot().speed,
            key: document.querySelector("#editor [data-focused=true]")?.dataset.key,
            adjusting: document.querySelector("#editor [data-adjusting=true]")?.dataset.key,
          }),
      );
    return {
      externalUpdates: true,
      draftPreserved: true,
      closeCommitsDraft: true,
      staleAfterReopen: true,
      repeatedOpen: true,
    };
  });
  if (errors.length) throw new Error(JSON.stringify(errors));
  return { behaviour: check, artwork, lifecycle, runtimeErrors: errors };
};
module.exports = { runSettingsUi };
