import type { MessageKey } from "./i18n/catalogues";

export type HomeSection = "apps" | "continueWatching" | "inputs";
export type HomeAppArrangement = "grid" | "scroll";

export interface HomeLayoutDefinition {
  readonly appArrangement: HomeAppArrangement | "preference";
  readonly belowFold: readonly HomeSection[];
  readonly dockInputsWhenSpaceAllows: boolean;
  readonly labelKey: MessageKey;
  readonly main: readonly HomeSection[];
  readonly scroll: "offset" | "native";
}

const homeLayouts = {
  standard: {
    appArrangement: "preference",
    belowFold: [],
    dockInputsWhenSpaceAllows: true,
    labelKey: "appearance.standardLayout",
    main: ["apps", "continueWatching", "inputs"],
    scroll: "offset",
  },
  cinema: {
    appArrangement: "scroll",
    belowFold: ["inputs"],
    dockInputsWhenSpaceAllows: false,
    labelKey: "appearance.cinemaLayout",
    main: ["continueWatching", "apps"],
    scroll: "native",
  },
} as const satisfies Readonly<Record<string, HomeLayoutDefinition>>;

export type HomeLayoutId = keyof typeof homeLayouts;

export const DEFAULT_HOME_LAYOUT: HomeLayoutId = "standard";
export const HOME_LAYOUT_IDS: readonly HomeLayoutId[] = Object.keys(homeLayouts) as HomeLayoutId[];
export const HOME_LAYOUT_OPTIONS = HOME_LAYOUT_IDS.map((value) => ({ value, labelKey: homeLayouts[value].labelKey }));

export const getHomeLayout = (id: HomeLayoutId): HomeLayoutDefinition => homeLayouts[id];

export const usesHomeAppRail = (settings: { homeAppLayout: HomeAppArrangement; homeLayout: HomeLayoutId }) => {
  const { appArrangement } = getHomeLayout(settings.homeLayout);
  return appArrangement === "scroll" || (appArrangement === "preference" && settings.homeAppLayout === "scroll");
};
