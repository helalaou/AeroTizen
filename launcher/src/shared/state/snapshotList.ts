import { equalRecord } from "./equalRecord";

export const snapshotList = <T extends object>(
  items: readonly T[],
  previous?: readonly Readonly<T>[],
): readonly Readonly<T>[] =>
  previous && previous.length === items.length && items.every((item, index) => equalRecord(item, previous[index]))
    ? previous
    : Object.freeze(items.map((item) => Object.freeze({ ...item })));
