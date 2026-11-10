import type { HomeBridge, SettingsBridge } from "../contracts/launcher";
import type { SettingsStore } from "../contracts/preferences";
import type { StatusStores } from "../contracts/status";
import type { LauncherUpdateNotice } from "../contracts/updates";
import type { LauncherPlatform, LauncherRuntime } from "../platform/tizen/launcherRuntime";
import type { LauncherUpdates } from "../services/createLauncherUpdates";
import { catalogues, resolveLanguage } from "../shared/i18n/catalogues";
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
    updates: LauncherUpdateNotice,
  ): MountedView<HomeBridge>;
  settings(
    runtime: LauncherRuntime,
    platform: LauncherPlatform,
    settings: SettingsStore,
    mount: HTMLElement,
    translations: Translations,
    updates: LauncherUpdateNotice,
  ): MountedView<SettingsBridge>;
}

// Both views share preferences and expose their controls after mounting.
export const createLauncherApp = (
  runtime: LauncherRuntime,
  platform: LauncherPlatform,
  hosts: { home: HTMLElement; settings: HTMLElement },
  views: LauncherViews,
  updates: LauncherUpdates,
  settings: SettingsStore,
) => {
  const status = { time: runtime.clock, network: runtime.network, weather: runtime.weather };
  const previousHome = runtime.homeScreen;
  const previousSettings = runtime.settingsUi;
  const previousTranslate = runtime.translate;
  const document = hosts.home.ownerDocument;
  const window = document.defaultView;
  const html = document.documentElement;
  const originalLanguage = html.lang;
  const originalDirection = html.dir;
  const language = () => {
    const navigator = window?.navigator;
    const languages = navigator?.languages;
    return resolveLanguage(
      settings.getSnapshot().language,
      languages?.length ? languages : [navigator?.language || ""],
    );
  };
  const translations = createTranslations(language());
  const translate: typeof runtime.translate = (key, values) => translations.getSnapshot().t(key, values);
  const syncLanguage = () => {
    const next = language();
    if (html.lang !== next) {
      html.lang = next;
    }
    const direction = catalogues[next]?.direction ?? "ltr";
    if (html.dir !== direction) {
      html.dir = direction;
    }
    translations.setLanguage(next);
  };
  const unsubscribeLanguage = settings.subscribe(syncLanguage);
  syncLanguage();
  window?.addEventListener("languagechange", syncLanguage);
  let home: MountedView<HomeBridge> | undefined;
  let editor: MountedView<SettingsBridge> | undefined;
  let disposed = false;
  const visibility = () => {
    if (document.hidden) {
      home?.bridge.blur();
    } else {
      home?.bridge.focus();
      void updates.check();
    }
  };
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    document.removeEventListener("visibilitychange", visibility);
    window?.removeEventListener("languagechange", syncLanguage);
    unsubscribeLanguage();
    html.lang = originalLanguage;
    html.dir = originalDirection;
    updates.dispose();
    editor?.dispose();
    home?.dispose();
    if (editor && runtime.settingsUi === editor.bridge) {
      runtime.settingsUi = previousSettings;
    }
    if (home && runtime.homeScreen === home.bridge) {
      runtime.homeScreen = previousHome;
    }
    if (runtime.translate === translate) {
      runtime.translate = previousTranslate;
    }
  };
  try {
    runtime.translate = translate;
    home = views.home(runtime, settings, hosts.home, status, translations, updates);
    runtime.homeScreen = home.bridge;
    editor = views.settings(runtime, platform, settings, hosts.settings, translations, updates);
    runtime.settingsUi = editor.bridge;
    document.addEventListener("visibilitychange", visibility);
    if (!document.hidden) {
      void updates.check();
    }
    return { dispose, home: home.bridge, settings: editor.bridge };
  } catch (error) {
    dispose();
    throw error;
  }
};
