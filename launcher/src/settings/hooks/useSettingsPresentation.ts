import { useLayoutEffect } from "preact/hooks";

// One owner for the Settings shell class, including close and unmount.
export const useSettingsPresentation = (open: boolean) => {
  useLayoutEffect(() => {
    document.body.classList.toggle("editing", open);
    return () => document.body.classList.remove("editing");
  }, [open]);
};
