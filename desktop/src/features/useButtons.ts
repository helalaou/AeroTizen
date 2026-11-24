import { useRef, useState } from "react";
import type {
  DesktopService,
  ButtonChange,
  ButtonInventoryChange,
  ButtonMappings,
  ButtonTargetApp,
  TvButtonMapping,
} from "../contracts";
import { checkButtonActivation, needsActivationCheck } from "../services/buttonActivation";
import type { ButtonActivation } from "../services/buttonActivation";
import type { FeatureContext } from "./context";
import { showToast } from "../Toasts";

function announceAssignment({ button, mode, app_name }: TvButtonMapping) {
  switch (mode) {
    case "default":
      showToast(`${button} restored to its original action.`);
      break;
    case "disabled":
      showToast(`${button} disabled.`);
      break;
    case "app":
      showToast(app_name ? `${button} now opens ${app_name}.` : `${button} assignment is active.`);
  }
}

export function useButtons(service: DesktopService, context: FeatureContext) {
  const { selected, mounted, run, loadPage, cancelPageRead } = context;
  const [buttonMappings, setButtonMappings] = useState<ButtonMappings | null>(null);
  const [buttonsLoading, setButtonsLoading] = useState(false);
  const [buttonsError, setButtonsError] = useState<string | null>(null);
  const [buttonChangeError, setButtonChangeError] = useState<string | null>(null);
  const [buttonActivation, setButtonActivation] = useState<ButtonActivation | null>(null);
  const [buttonApps, setButtonApps] = useState<ButtonTargetApp[] | null>(null);
  const [buttonAppsLoading, setButtonAppsLoading] = useState(false);
  const buttonAppsReading = useRef(false);
  const [buttonAppsError, setButtonAppsError] = useState<string | null>(null);
  const loadButtons = (id: string) => {
    cancelPageRead();
    setButtonActivation(null);
    setButtonChangeError(null);
    loadPage((signal) => service.listButtons(id, signal), setButtonMappings, setButtonsError, setButtonsLoading);
  };

  const buttonActions = service.buttonActions;
  const loadButtonApps = (id: string) => {
    if (buttonActions) {
      cancelPageRead();
      setButtonActivation(null);
      loadPage(
        (signal) => buttonActions.listApps(id, signal),
        setButtonApps,
        setButtonAppsError,
        (loading) => {
          buttonAppsReading.current = loading;
          setButtonAppsLoading(loading);
        },
      );
    }
  };

  const verifyActivation = (id: string, expected: TvButtonMapping) => {
    loadPage(
      (signal) =>
        checkButtonActivation(
          expected,
          (signal) => service.listButtons(id, signal),
          signal,
          (snapshot) => {
            if (mounted.current) setButtonMappings(snapshot);
          },
        ),
      (result) => {
        if (!result) return;
        if (result.mappings) setButtonMappings(result.mappings);
        setButtonActivation(result.confirmed ? null : { button: expected.button, state: "unconfirmed" });
        if (result.confirmed) announceAssignment(expected);
      },
      (message) => {
        if (message) setButtonActivation({ button: expected.button, state: "unconfirmed" });
      },
      (checking) =>
        setButtonActivation((current) => {
          if (checking) return { button: expected.button, state: "checking" };
          return current?.button === expected.button ? { ...current, state: "unconfirmed" } : current;
        }),
      { preserveResult: true },
    );
  };

  const changeButton = async (
    id: string,
    change: ButtonChange,
    reportError: (message: string) => void = setButtonChangeError,
  ) => {
    if (!buttonActions || selected?.id !== id) return Promise.resolve(false);
    let saved: TvButtonMapping | null = null;
    const success = await run(
      "Saving button assignment…",
      async () => {
        setButtonChangeError(null);
        const updated = await buttonActions.change(id, change);
        const name = updated.app_name ?? buttonApps?.find((app) => app.id === updated.app_id)?.name ?? null;
        const assignment = { ...updated, app_name: name };
        saved = assignment;
        if (!mounted.current) return;
        setButtonMappings((current) =>
          current?.status === "ready"
            ? {
                ...current,
                buttons: current.buttons.map((row) => (row.button === change.button ? assignment : row)),
              }
            : current,
        );
      },
      "app",
      reportError,
    );
    if (success && mounted.current && saved) {
      if (needsActivationCheck(saved)) verifyActivation(id, saved);
      else announceAssignment(saved);
    }
    return success;
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
    if (success && mounted.current) {
      loadButtons(id);
      if (change.action === "learn") showToast(`${change.button} learned.`);
      if (change.action === "rename") showToast(`Button renamed to ${change.new_name}.`);
      if (change.action === "reset") showToast("Remote buttons reset.");
    }
    return success;
  };

  return {
    buttonMappings,
    buttonsLoading,
    buttonsError,
    buttonChangeError,
    buttonActivation,
    buttonApps,
    buttonAppsLoading,
    buttonAppsError,
    loadButtons,
    loadButtonApps,
    cancelButtonApps: () => {
      if (buttonAppsReading.current) cancelPageRead();
    },
    changeButton,
    updateButtonInventory,
  };
}
