import { vi } from "vitest";

import type { AppPresentation, InstalledApp } from "../../contracts/launcher";
import { createStore } from "../../shared/state/createStore";
import type { HomeEnvironment, HomeState } from "../types";

export const createCardEnvironment = (selected = "", presentation: Partial<AppPresentation> = {}) => {
  const state = createStore<HomeState>({
    active: true,
    appOffset: 0,
    appsEndOffset: 0,
    continueOffset: 0,
    draft: null,
    menu: null,
    moving: null,
    page: "home",
    scroll: 0,
    selected,
  });
  const runtime: Pick<HomeEnvironment["runtime"], "inputs"> = {
    inputs: {
      sources: [],
      watching: false,
      isVisible: () => true,
      label: (source, defaultLabel) => source.editName ?? defaultLabel ?? runtime.inputs.portName(source),
      portName: (source) => `${source.type} ${source.number}`,
      refresh: () => undefined,
      show: () => undefined,
      subscribe: () => () => undefined,
    },
  };
  // Isolated cards use only these Home controller fields.
  const environment: Pick<HomeEnvironment, "state" | "nodes" | "activate" | "select" | "runtime" | "describe"> = {
    state,
    nodes: new Map<string, HTMLElement>(),
    activate: vi.fn(),
    select: vi.fn(),
    runtime: runtime as HomeEnvironment["runtime"],
    describe: (app: InstalledApp): AppPresentation => ({
      artwork: [],
      background: "black",
      label: app.name,
      largeLogo: false,
      logoColour: "white",
      logoPath: null,
      textColour: "white",
      title: app.name,
      useAppIcon: true,
      ...presentation,
    }),
  };
  return environment as HomeEnvironment;
};
