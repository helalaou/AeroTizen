const groups = ['bg-anim', 'speed-row', 'bg-still', 'weather-display', 'weather-location',
  'weather-results', 'weather-visibility', 'units', 'time-formats', 'date-formats',
  'network-visibility', 'live-tv-visibility', 'card-sizes', 'input-visibility', 'input-names', 'all-apps', 'escape'];

export const collectSettingsRows = (root: HTMLElement | null): HTMLElement[][] => {
  const rows: HTMLElement[][] = [];
  groups.forEach(id => {
    const group = root?.querySelector<HTMLElement>('#' + id);
    if (!group || group.hidden) { return; }
    const items = group.dataset.key ? [group] : Array.from(group.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && Boolean(element.dataset.key));
    let last: HTMLElement[] | undefined;
    items.forEach(element => {
      if (!last || last[0].offsetTop !== element.offsetTop) { last = []; rows.push(last); }
      last.push(element);
    });
  });
  return rows;
};
