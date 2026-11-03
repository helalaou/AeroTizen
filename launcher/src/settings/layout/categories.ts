import { AppWindow, Cable, CloudSun, Image, LayoutDashboard } from "lucide-preact";
export const categories = [
  { id: "appearance", title: "Home appearance", hint: "Layout and indicators", icon: LayoutDashboard },
  { id: "apps", title: "Applications", hint: "Home favourites and Samsung Home", icon: AppWindow },
  { id: "wallpaper", title: "Backgrounds", hint: "Colours and animation", icon: Image },
  { id: "status", title: "Weather and clock", hint: "Weather, time and date", icon: CloudSun },
  { id: "sources", title: "Inputs", hint: "Live TV and HDMI", icon: Cable },
] as const;
export type Category = (typeof categories)[number]["id"];
export interface SettingsDrawerState {
  category: Category;
  expanded: boolean;
}
