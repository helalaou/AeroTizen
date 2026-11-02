import type { Store } from "../state/createStore";
import { createStore } from "../state/createStore";

export type Direction = "left" | "right" | "up" | "down";
export interface Navigation extends Store<string | undefined> {
  clear(): void;
  current(): HTMLElement | undefined;
  firstKey(container?: HTMLElement): string | undefined;
  focus(): HTMLElement | undefined;
  invalidate(): void;
  move(direction: Direction): void;
  register(key: string, node: HTMLElement | null): void;
  reset(key: string): void;
  select(key: string | undefined): void;
  setScope?(element: HTMLElement | null): void;
}
interface Target {
  key: string;
  left: number;
  node: HTMLElement;
}

interface Position {
  readonly column: number;
  readonly row: number;
}
const DIRECTION_OFFSETS = {
  left: { row: 0, column: -1 },
  right: { row: 0, column: 1 },
  up: { row: -1, column: 0 },
  down: { row: 1, column: 0 },
} as const;

// Ref callbacks register controls. Geometry is read only when the layout changes;
// the selected key is observable state, and components render its focus styling.
export const createNavigation = (onFocus: (element: HTMLElement) => void): Navigation => {
  const focused = createStore<string | undefined>(undefined);
  const nodes = new Map<string, HTMLElement>();
  let rows: Target[][] | undefined;
  let scope: HTMLElement | null = null;
  let keys = new Map<string, Position>();
  let position: Position = { row: 0, column: 0 };
  let selected: string | undefined;
  const getRows = () => {
    if (!rows) {
      // These private layout buffers never change a published snapshot or caller data.
      const measuredRows: Target[][] = [];
      keys = new Map();
      const positions = [...nodes]
        .filter(([, node]) => node.offsetParent !== null && (!scope || scope.contains(node)))
        .map(([key, node]) => {
          const top = scope ? node.getBoundingClientRect().top : node.offsetTop;
          return {
            key,
            node,
            top,
            bottom: top + node.offsetHeight,
            left: scope ? node.getBoundingClientRect().left : node.offsetLeft,
          };
        })
        .sort((a, b) => a.top - b.top || a.left - b.left);
      let bottom = -Infinity;
      positions.forEach((target) => {
        if (target.top >= bottom) {
          measuredRows.push([]);
          bottom = target.bottom;
        } else {
          bottom = Math.min(bottom, target.bottom);
        }
        measuredRows[measuredRows.length - 1].push(target);
      });
      measuredRows.forEach((items, rowIndex) => {
        items.sort((a, b) => a.left - b.left);
        items.forEach((target, columnIndex) => keys.set(target.key, { row: rowIndex, column: columnIndex }));
      });
      rows = measuredRows;
    }
    return rows;
  };
  const currentTarget = () => {
    const all = getRows();
    const current = (selected && keys.get(selected)) || position;
    const row = Math.max(0, Math.min(current.row, all.length - 1));
    const column = Math.max(0, Math.min(current.column, (all[row]?.length || 1) - 1));
    position = { row, column };
    return all[row]?.[column];
  };
  const focus = () => {
    const target = currentTarget();
    selected = target?.key;
    focused.set(selected);
    if (target) {
      onFocus(target.node);
    }
    return target?.node;
  };
  return {
    getSnapshot: focused.getSnapshot,
    subscribe: focused.subscribe,
    setScope(element) {
      scope = element;
      rows = undefined;
    },
    register(key, node) {
      if (node) {
        nodes.set(key, node);
      } else {
        nodes.delete(key);
      }
      rows = undefined;
    },
    focus,
    firstKey(container) {
      if (container) {
        for (const row of getRows()) {
          const target = row.find((item) => container.contains(item.node));
          if (target) {
            return target.key;
          }
        }
      }
      return undefined;
    },
    current: () => currentTarget()?.node,
    clear: () => focused.set(undefined),
    invalidate: () => {
      rows = undefined;
    },
    select: (key) => {
      selected = key;
      focused.set(key);
    },
    reset: (key) => {
      focused.set(undefined);
      position = { row: 0, column: 0 };
      selected = key;
      rows = undefined;
    },
    move: (direction) => {
      currentTarget();
      selected = undefined;
      const offset = DIRECTION_OFFSETS[direction];
      position = { row: position.row + offset.row, column: position.column + offset.column };
      focus();
    },
  };
};
