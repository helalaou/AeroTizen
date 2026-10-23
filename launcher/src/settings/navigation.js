// Remote focus is transient DOM state. Arrow keys never render components or
// rebuild the row map. Rebuild after a render or resize, including wrapped dates.
export const createNavigation = (A) => {
  let rows = null;
  let keys = Object.create(null);
  let row = 0;
  let columns = [];
  let selected = null;
  let previous = null;

  function children(id) {
    return Array.from(A.$(id).children);
  }

  function getRows() {
    if (rows) {
      return rows;
    }
    const dateRows = [];
    children('date-formats').forEach(element => {
      const last = dateRows[dateRows.length - 1];
      if (!last || last[0].offsetTop !== element.offsetTop) {
        dateRows.push([element]);
      } else {
        last.push(element);
      }
    });
    const backgrounds = A.chunk(children('bg-anim'), 8);
    if (!A.$('speed-row').hidden) {
      backgrounds.push(children('speed-row'));
    }
    const apps = Array.from(A.$('all-apps').querySelectorAll('[data-key]'));
    rows = backgrounds.concat(A.chunk(children('bg-still'), 8), [children('weather-display')],
      [children('weather-location')], children('weather-results').map(element => [element]),
      [children('weather-visibility')], [children('units')], [children('time-formats')], dateRows,
      [children('network-visibility')], [children('live-tv-visibility')], [children('card-sizes')],
      [children('input-visibility')], [children('input-names')], A.chunk(apps, 5), [[A.$('escape')]])
      .filter(items => items.length);
    keys = Object.create(null);
    rows.forEach((items, i) => items.forEach((element, j) => {
      keys[element.dataset.key] = [i, j];
    }));
    return rows;
  }

  function focus() {
    const all = getRows();
    if (selected && keys[selected]) {
      row = keys[selected][0];
      columns[row] = keys[selected][1];
    }
    row = Math.max(0, Math.min(row, all.length - 1));
    columns[row] = Math.max(0, Math.min(columns[row] || 0, all[row].length - 1));
    const element = all[row][columns[row]];
    if (previous && previous !== element) {
      previous.classList.remove('focused');
    }
    element.classList.add('focused');
    previous = element;
    selected = element.dataset.key;
    A.$('editor').scrollTop = Math.max(0, element.offsetTop - 640);
    return element;
  }

  return {
    focus,
    invalidate() { rows = null; },
    select(key) { selected = key; },
    reset(key) {
      A.clearFocus();
      previous = null;
      row = 0;
      columns = [];
      selected = key;
      rows = null;
    },
    current() {
      const all = getRows();
      return all[row] && all[row][columns[row] || 0];
    },
    move(code) {
      const count = getRows().length;
      const column = columns[row] || 0;
      const K = A.config.KEY;
      selected = null;
      if (code === K.LEFT) { columns[row] = column - 1; }
      else if (code === K.RIGHT) { columns[row] = column + 1; }
      else if (code === K.UP) { row = Math.max(0, row - 1); columns[row] = column; }
      else if (code === K.DOWN) { row = Math.min(count - 1, row + 1); columns[row] = column; }
      focus();
    }
  };
};
