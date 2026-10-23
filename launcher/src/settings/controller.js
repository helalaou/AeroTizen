// Components receive snapshots and named actions. Only this adapter writes the
// existing settings store or calls the TV/runtime modules.
export function createSettingsController(A, navigation, render) {
  let showing = false;
  let previewing = false;
  let searchVersion = 0;
  let search = { query: '', results: [], message: '' };

  function update() {
    if (!showing) {
      return;
    }
    render({ settings: { ...A.settings }, search });
    navigation.invalidate();
    navigation.focus();
  }

  function commit(patch, after) {
    Object.assign(A.settings, patch);
    A.settings.save();
    if (after) {
      after();
    }
    update();
  }

  function cancelSearch() {
    searchVersion++;
    search = { ...search, results: [], message: '' };
  }

  function searchLocations() {
    const query = search.query.trim();
    const version = ++searchVersion;
    search = { ...search, results: [], message: query.length < 2 ?
      'Enter at least two characters, then select Search.' : 'Searching…' };
    navigation.select('weather:search');
    update();
    if (query.length < 2) {
      return;
    }
    window.Weather.searchLocations(query, results => {
      if (!showing || version !== searchVersion) {
        return;
      }
      const message = results === null ? 'Could not search. Check your connection and try again.' :
        results.length ? 'Select your location. Add a region or country to the search if needed.' :
        'No locations found. Try a nearby town or add a region or country.';
      search = { ...search, results: results || [], message };
      update();
    });
  }

  const actions = {
    setBackground(background) { commit({ background }, A.applyBackground); },
    setWeatherVisible(showWeather) { commit({ showWeather }, () => window.Weather.updateVisibility()); },
    setLocationVisible(weatherShowLocation) { commit({ weatherShowLocation }, () => window.Weather.updateDisplay()); },
    setTempUnit(tempUnit) { commit({ tempUnit }, () => window.Weather.refresh()); },
    setDateFormat(dateFormat) { commit({ dateFormat }, A.clock.tick); },
    setNetworkVisible(showNetwork) { commit({ showNetwork }, A.network.updateVisibility); },
    setLiveTvVisible(showLiveTv) { commit({ showLiveTv }, A.inputs.render); },
    setCardSize(cardSize) { commit({ cardSize }, A.homeScreen.render); },
    setHdmiVisibility(hideDisconnectedHdmi) { commit({ hideDisconnectedHdmi }, A.inputs.render); },
    setTimeFormat(format) {
      navigation.select('time:' + format);
      const patch = format === 'none' ? { showTime: false } : { showTime: true, timeFormat: format };
      commit(patch, A.clock.tick);
    },
    setLocation(weatherLocation) {
      cancelSearch();
      navigation.select(weatherLocation ? 'weather:query' : 'weather:auto');
      commit({ weatherLocation }, () => window.Weather.refresh());
    },
    setQuery(query) {
      cancelSearch();
      search = { ...search, query };
      update();
    },
    search: searchLocations,
    editInput(key, element) {
      navigation.select(key);
      navigation.focus();
      element.querySelector('input').focus();
    },
    saveInputName(port, value) {
      const inputNames = { ...A.settings.inputNames };
      if (value) {
        inputNames[port] = value;
      } else {
        delete inputNames[port];
      }
      commit({ inputNames }, A.inputs.render);
    },
    toggleApp(id) {
      const home = A.settings.home.indexOf(id) < 0 ? A.settings.home.concat(id) : A.settings.home.filter(item => item !== id);
      commit({ home });
    },
    openStore: A.apps.openStore,
    useSamsungHome: A.homewatch.useSamsungHome,
    preview() {
      previewing = true;
      document.body.classList.add('previewing');
      A.clearFocus();
      A.toast('Previewing. Press any key to return');
    }
  };

  function close() {
    const active = document.activeElement;
    if (active && active.tagName === 'INPUT') {
      active.blur();
    }
    showing = false;
    previewing = false;
    cancelSearch();
    document.body.classList.remove('editing', 'previewing');
    A.hideToast();
    A.$('editor').hidden = true;
    A.settings.save();
    A.homeScreen.render();
  }

  function keydown(code, event) {
    const K = A.config.KEY;
    if (previewing) {
      event.preventDefault();
      previewing = false;
      document.body.classList.remove('previewing');
      A.hideToast();
      navigation.focus();
      return;
    }
    if (code === K.BACK || code === K.ESC) {
      event.preventDefault();
      close();
      return;
    }
    const current = navigation.current();
    if (current && current.dataset.key === 'speed' && (code === K.LEFT || code === K.RIGHT)) {
      event.preventDefault();
      const cfg = A.config.SPEED;
      const next = A.settings.speed + (code === K.LEFT ? -1 : 1) * cfg.STEP;
      const speed = Math.round(Math.max(cfg.MIN, Math.min(cfg.MAX, next)) * 100) / 100;
      commit({ speed }, () => window.Backgrounds.setSpeed(speed));
      return;
    }
    if (code === K.ENTER) {
      event.preventDefault();
      if (current) {
        navigation.select(current.dataset.key);
        current.click();
      }
      return;
    }
    if ([K.LEFT, K.RIGHT, K.UP, K.DOWN].indexOf(code) >= 0) {
      event.preventDefault();
      navigation.move(code);
    }
  }

  return {
    actions,
    open() {
      showing = true;
      navigation.reset('bg:' + A.settings.background);
      document.body.classList.add('editing');
      A.$('editor').hidden = false;
      update();
    },
    close,
    isOpen() { return showing; },
    focus: navigation.focus,
    keydown,
    resize() {
      navigation.invalidate();
      if (showing && !previewing) {
        navigation.focus();
      }
    }
  };
}
