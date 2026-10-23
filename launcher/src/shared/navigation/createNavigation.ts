export type Direction = 'left' | 'right' | 'up' | 'down';
export interface Navigation {
  focus(): HTMLElement | undefined; clear(): void; invalidate(): void;
  select(key: string | undefined): void; reset(key: string): void;
  current(): HTMLElement | undefined; move(direction: Direction): void;
}

// Only focus classes and scroll position are imperative. The screen owns markup.
export const createNavigation = (measure: () => HTMLElement[][], onFocus: (element: HTMLElement) => void): Navigation => {
  let rows: HTMLElement[][] | undefined;
  let keys = new Map<string, [number, number]>();
  let row = 0, column = 0;
  let selected: string | undefined;
  let previous: HTMLElement | undefined;
  const getRows = () => {
    if (!rows) {
      rows = measure().filter(items => items.length);
      keys = new Map();
      rows.forEach((items, i) => items.forEach((element, j) => {
        if (element.dataset.key) { keys.set(element.dataset.key, [i, j]); }
      }));
    }
    return rows;
  };
  const current = () => {
    const all = getRows();
    const position = selected && keys.get(selected);
    if (position) { [row, column] = position; }
    row = Math.max(0, Math.min(row, all.length - 1));
    column = Math.max(0, Math.min(column, (all[row]?.length || 1) - 1));
    return all[row]?.[column];
  };
  const clear = () => { previous?.classList.remove('focused'); previous = undefined; };
  const focus = () => {
    const element = current();
    if (previous !== element) { clear(); }
    if (element) {
      element.classList.add('focused'); previous = element; selected = element.dataset.key; onFocus(element);
    }
    return element;
  };
  return {
    focus, current, clear,
    invalidate: () => { rows = undefined; },
    select: (key: string | undefined) => { selected = key; },
    reset: (key: string) => { clear(); row = column = 0; selected = key; rows = undefined; },
    move: (direction: Direction) => {
      current(); selected = undefined;
      if (direction === 'left') { column--; }
      if (direction === 'right') { column++; }
      if (direction === 'up') { row--; }
      if (direction === 'down') { row++; }
      focus();
    }
  };
};
