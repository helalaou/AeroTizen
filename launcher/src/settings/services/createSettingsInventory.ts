import { createStore } from '../../shared/state/createStore';
import { equalRecord } from '../../shared/state/equalRecord';
import type { InputOption, SettingsInventory, SettingsInventorySnapshot } from '../types';
import type { LauncherRuntime } from './launcherRuntime';

const snapshotList = <T extends object>(items: readonly T[], previous?: readonly Readonly<T>[]): readonly Readonly<T>[] =>
  previous && previous.length === items.length && items.every((item, index) => equalRecord(item, previous[index])) ?
    previous : Object.freeze(items.map(item => Object.freeze({ ...item })));

// Runtime callbacks publish data. Rendering reads cached immutable snapshots only.
export const createSettingsInventory = (runtime: Pick<LauncherRuntime, 'apps' | 'inputs' | 'continueWatching'>): SettingsInventory => {
  const read = (previous?: SettingsInventorySnapshot): SettingsInventorySnapshot => {
    const apps = snapshotList(runtime.apps.all, previous?.apps);
    const inputs = snapshotList<InputOption>(runtime.inputs.sources.filter(source => source.type !== 'TV').map(source => ({
      port: runtime.inputs.portName(source), placeholder: source.editName
    })), previous?.inputs);
    const continueSources = snapshotList(runtime.continueWatching?.sources || [], previous?.continueSources);
    const continueMessage = runtime.continueWatching?.message || '';
    return previous && continueSources === previous.continueSources && continueMessage === previous.continueMessage && apps === previous.apps && inputs === previous.inputs ? previous : Object.freeze({ apps, inputs, continueSources, continueMessage });
  };
  const store = createStore(read());
  const refresh = () => store.set(read(store.getSnapshot()));
  const unsubscribeApps = runtime.apps.subscribe(refresh);
  const unsubscribeInputs = runtime.inputs.subscribe(refresh);
  const unsubscribeContinue = runtime.continueWatching?.subscribe(refresh);
  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
    dispose() { unsubscribeApps(); unsubscribeInputs(); unsubscribeContinue?.(); }
  };
};
