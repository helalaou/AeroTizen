import { useState } from "react";
import { App } from "../App";
import { createSimulatorService } from "./service";
import { createSimulatorStore } from "./store";
import { SimulatorControls } from "./SimulatorControls";

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export default function SimulatorApp() {
  const [store] = useState(() => createSimulatorStore(browserStorage()));
  const [service] = useState(() => createSimulatorService(store));
  const [revision, setRevision] = useState(0);
  return (
    <>
      <App key={revision} service={service} />
      <SimulatorControls
        store={store}
        onReload={() => {
          store.invalidateRequests();
          setRevision((value) => value + 1);
        }}
      />
    </>
  );
}
