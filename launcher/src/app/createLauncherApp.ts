import type { HomeBridge, SettingsBridge } from "../contracts/launcher";
import type { SettingsStore } from "../contracts/preferences";
import type { StatusStores } from "../contracts/status";
import type { LauncherPlatform, LauncherRuntime } from "../platform/tizen/launcherRuntime";
import { createSettingsStore } from "../services/createSettingsStore";
import { createStatusStores } from "../services/createStatusStores";
import { resolveLanguage } from "../shared/i18n/catalogues";
import type { Translations } from "../shared/i18n/createTranslations";
import { createTranslations } from "../shared/i18n/createTranslations";

export interface MountedView<Bridge> {
  bridge: Bridge;
  dispose(): void;
}

export interface LauncherViews {
  home(
    runtime: LauncherRuntime,
    settings: SettingsStore,
    mount: HTMLElement,
    status: StatusStores,
    translations: Translations,
  ): MountedView<HomeBridge>;
  settings(
    runtime: LauncherRuntime,
    platform: LauncherPlatform,
    settings: SettingsStore,
    mount: HTMLElement,
    translations: Translations,
  ): MountedView<SettingsBridge>;
}

// One settings owner and one teardown path for both views. The legacy key router
// receives bridges only after their views are mounted.
export const createLauncherApp = (
  runtime: LauncherRuntime,
  platform: LauncherPlatform,
  hosts: { home: HTMLElement; settings: HTMLElement },
  views: LauncherViews,
  transaction: (action: () => void) => void = (action) => action(),
) => {
  const settings = createSettingsStore(runtime.settings, {
    ...runtime.config.DEFAULTS,
    home: [],
    language: "auto",
    tempUnit: "C",
    timeFormat: "12",
  });
  const status = createStatusStores(runtime, platform, transaction, settings);
  const previousHome = runtime.homeScreen;
  const previousSettings = runtime.settingsUi;
  const document = hosts.home.ownerDocument;
  const window = document.defaultView;
  const html = document.documentElement;
  const originalLanguage = html.lang;
  const language = () => {
    const navigator = window?.navigator;
    const languages = navigator?.languages;
    return resolveLanguage(
      settings.getSnapshot().language,
      languages?.length ? languages : [navigator?.language || ""],
    );
  };
  const translations = createTranslations(language());
  const syncLanguage = () => {
    const next = language();
    if (html.lang !== next) {
      html.lang = next;
    }
    translations.setLanguage(next);
  };
  const unsubscribeLanguage = settings.subscribe(syncLanguage);
  syncLanguage();
  window?.addEventListener("languagechange", syncLanguage);
  let home: MountedView<HomeBridge> | undefined;
  let editor: MountedView<SettingsBridge> | undefined;
  let disposed = false;
  const visibility = () => (document.hidden ? home?.bridge.blur() : home?.bridge.focus());
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    document.removeEventListener("visibilitychange", visibility);
    window?.removeEventListener("languagechange", syncLanguage);
    unsubscribeLanguage();
    html.lang = originalLanguage;
    editor?.dispose();
    home?.dispose();
    if (editor && runtime.settingsUi === editor.bridge) {
      runtime.settingsUi = previousSettings;
    }
    if (home && runtime.homeScreen === home.bridge) {
      runtime.homeScreen = previousHome;
    }
    status.dispose();
    settings.dispose();
  };
  try {
    home = views.home(runtime, settings, hosts.home, status, translations);
    runtime.homeScreen = home.bridge;
    editor = views.settings(runtime, platform, settings, hosts.settings, translations);
    runtime.settingsUi = editor.bridge;
    document.addEventListener("visibilitychange", visibility);
    return { dispose };
  } catch (error) {
    dispose();
    throw error;
  }
};
