import { useState } from "react";
import type {
  DesktopService,
  ButtonChange,
  ButtonInventoryChange,
  ButtonMappings,
  ButtonTargetApp,
} from "../contracts";
import type { FeatureContext } from "./context";

export function useButtons(service: DesktopService, context: FeatureContext) {
  const { selected, mounted, run, loadPage } = context;
  const [buttonMappings, setButtonMappings] = useState<ButtonMappings | null>(null);
  const [buttonsLoading, setButtonsLoading] = useState(false);
  const [buttonsError, setButtonsError] = useState<string | null>(null);
  const [buttonChangeError, setButtonChangeError] = useState<string | null>(null);
  const [buttonApps, setButtonApps] = useState<ButtonTargetApp[] | null>(null);
  const [buttonAppsLoading, setButtonAppsLoading] = useState(false);
  const [buttonAppsError, setButtonAppsError] = useState<string | null>(null);
  const loadButtons = (id: string) => {
    setButtonChangeError(null);
    loadPage((signal) => service.listButtons(id, signal), setButtonMappings, setButtonsError, setButtonsLoading);
  };

  const buttonActions = service.buttonActions;
  const loadButtonApps = (id: string) => {
    if (buttonActions) {
      loadPage((signal) => buttonActions.listApps(id, signal), setButtonApps, setButtonAppsError, setButtonAppsLoading);
    }
  };

  const changeButton = (
    id: string,
    change: ButtonChange,
    reportError: (message: string) => void = setButtonChangeError,
  ) => {
    if (!buttonActions || selected?.id !== id) return Promise.resolve(false);
    return run(
      "Saving button assignment…",
      async () => {
        setButtonChangeError(null);
        const updated = await buttonActions.change(id, change);
        if (!mounted.current) return;
        const name = updated.app_name ?? buttonApps?.find((app) => app.id === updated.app_id)?.name ?? null;
        setButtonMappings((current) =>
          current?.status === "ready"
            ? {
                ...current,
                buttons: current.buttons.map((row) =>
                  row.button === change.button ? { ...updated, app_name: name } : row,
                ),
              }
            : current,
        );
      },
      "app",
      reportError,
    );
  };

  const updateButtonInventory = async (
    id: string,
    change: ButtonInventoryChange,
    reportError: (message: string) => void,
  ) => {
    if (!buttonActions || selected?.id !== id) return false;
    const success = await run(
      {
        learn: "Waiting for a remote button press…",
        rename: "Renaming remote button…",
        reset: "Resetting remote buttons…",
      }[change.action],
      async () => {
        setButtonChangeError(null);
        await buttonActions.updateInventory(id, change);
      },
      "app",
      reportError,
    );
    if (success && mounted.current) loadButtons(id);
    return success;
  };

  return {
    buttonMappings,
    buttonsLoading,
    buttonsError,
    buttonChangeError,
    buttonApps,
    buttonAppsLoading,
    buttonAppsError,
    loadButtons,
    loadButtonApps,
    changeButton,
    updateButtonInventory,
  };
}
