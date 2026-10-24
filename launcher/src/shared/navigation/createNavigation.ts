import { createStore } from '../state/createStore';
import type { Store } from '../state/createStore';

export type Direction = 'left' | 'right' | 'up' | 'down';
export interface Navigation extends Store<string | undefined> {
  register(key: string, node: HTMLElement | null): void;
  focus(): HTMLElement | undefined; clear(): void; invalidate(): void;
  select(key: string | undefined): void; reset(key: string): void;
  current(): HTMLElement | undefined; move(direction: Direction): void;
}
interface Target { key: string; node: HTMLElement }

// Ref callbacks register controls. Geometry is read only when the layout changes;
// the selected key is observable state, and components render its focus styling.
export const createNavigation = (onFocus: (element: HTMLElement) => void): Navigation => {
  const focused = createStore<string | undefined>(undefined);
  const nodes = new Map<string, HTMLElement>();
  let rows: Target[][] | undefined;
  let keys = new Map<string, [number, number]>();
  let row = 0, column = 0;
  let selected: string | undefined;
  const getRows = () => {
    if (!rows) {
      const measuredRows: Target[][] = [];
      keys = new Map();
      const positions = [...nodes].filter(([, node]) => node.offsetParent !== null)
        .map(([key, node]) => ({ key, node, top: node.offsetTop, left: node.offsetLeft }))
        .sort((a, b) => a.top - b.top || a.left - b.left);
      let top: number | undefined;
      positions.forEach(target => {
        if (top !== target.top) { top = target.top; measuredRows.push([]); }
        const items = measuredRows[measuredRows.length - 1];
        keys.set(target.key, [measuredRows.length - 1, items.length]);
        items.push(target);
      });
      rows = measuredRows;
    }
    return rows;
  };
  const currentTarget = () => {
    const all = getRows();
    const position = selected && keys.get(selected);
    if (position) { [row, column] = position; }
    row = Math.max(0, Math.min(row, all.length - 1));
    column = Math.max(0, Math.min(column, (all[row]?.length || 1) - 1));
    return all[row]?.[column];
  };
  const focus = () => {
    const target = currentTarget();
    selected = target?.key;
    focused.set(selected);
    if (target) { onFocus(target.node); }
    return target?.node;
  };
  return {
    getSnapshot: focused.getSnapshot,
    subscribe: focused.subscribe,
    register(key, node) {
      if (node) { nodes.set(key, node); } else { nodes.delete(key); }
      rows = undefined;
    },
    focus,
    current: () => currentTarget()?.node,
    clear: () => focused.set(undefined),
    invalidate: () => { rows = undefined; },
    select: key => { selected = key; },
    reset: key => { focused.set(undefined); row = column = 0; selected = key; rows = undefined; },
    move: direction => {
      currentTarget(); selected = undefined;
      if (direction === 'left') { column--; }
      if (direction === 'right') { column++; }
      if (direction === 'up') { row--; }
      if (direction === 'down') { row++; }
      focus();
    }
  };
};
