import { AppWindow, Cable, Clock, CloudSun, Image, Info, Languages, LayoutDashboard } from "lucide-preact";
export const categories = [
  { id: "appearance", title: "settings.appearance.title", hint: "settings.appearance.hint", icon: LayoutDashboard },
  { id: "apps", title: "settings.apps.title", hint: "settings.apps.hint", icon: AppWindow },
  { id: "wallpaper", title: "settings.wallpaper.title", hint: "settings.wallpaper.hint", icon: Image },
  { id: "status", title: "settings.status.title", hint: "settings.status.hint", icon: Clock },
  { id: "weather", title: "weather.title", hint: "settings.weather.hint", icon: CloudSun },
  { id: "sources", title: "common.inputs", hint: "settings.sources.hint", icon: Cable },
  { id: "language", title: "settings.language.title", hint: "settings.language.hint", icon: Languages },
  { id: "about", title: "settings.about.title", hint: "settings.about.hint", icon: Info },
] as const;
export type Category = (typeof categories)[number]["id"];
export interface SettingsDrawerState {
  category: Category;
  expanded: boolean;
}
