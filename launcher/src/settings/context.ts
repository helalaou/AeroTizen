import { createContext } from "preact";

import type { Navigation } from "../shared/navigation/createNavigation";

import type { SettingsEnvironment } from "./types";

export const SettingsContext = createContext<SettingsEnvironment | null>(null);
export const SettingsNavigationContext = createContext<Navigation | null>(null);
