import type { NetworkSnapshot, WeatherSnapshot } from "../contracts/status";
import { createStore } from "../shared/state/createStore";

export const createTestStatus = (timestamp = 0) => ({
  time: createStore(timestamp),
  network: createStore<NetworkSnapshot>({ kind: "unknown", strength: null, visible: false }),
  weather: createStore<WeatherSnapshot>({
    city: "",
    code: null,
    showLocation: false,
    temperature: null,
    visible: false,
  }),
  dispose: () => undefined,
});
