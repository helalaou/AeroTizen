import { useContext } from "preact/hooks";

import { SettingsNavigationContext } from "../context";

import { useSettingsEnvironment } from "./useSettingsEnvironment";

export const useSettingsNavigationOwner = () => {
  const navigation = useContext(SettingsNavigationContext);
  const environment = useSettingsEnvironment();
  return navigation ?? environment.navigation;
};
