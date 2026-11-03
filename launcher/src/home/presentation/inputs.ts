import type { InputSource } from "../../contracts/launcher";

const DEVICE_RULES = [
  { kind: "game", pattern: /xbox|playstation|ps\d|switch|nintendo|game|console/i },
  { kind: "pc", pattern: /pc|computer|mac|laptop/i },
  { kind: "box", pattern: /cable|box|roku|fire|apple|shield|chromecast|blu|dvd|satellite/i },
] as const;

const STATUS_LABELS = {
  live: "TV",
  active: "ACTIVE",
  connected: "ON",
  recognized: "RECOGNISED",
  pinned: "PINNED",
  empty: "OFF",
} as const;

export type InputKind = "tv" | "hdmi" | (typeof DEVICE_RULES)[number]["kind"];
interface Capabilities {
  readonly pinned: boolean;
  readonly recognized: boolean;
}

const getStatus = (source: InputSource, capabilities: Capabilities): keyof typeof STATUS_LABELS => {
  if (source.type === "TV") {
    return "live";
  }
  if (source.active) {
    return "active";
  }
  if (source.connected) {
    return "connected";
  }
  if (capabilities.recognized) {
    return "recognized";
  }
  if (capabilities.pinned) {
    return "pinned";
  }
  return "empty";
};

export const getInputPresentation = (source: InputSource, label: string, capabilities: Capabilities) => {
  const kind: InputKind =
    source.type === "TV" ? "tv" : (DEVICE_RULES.find((rule) => rule.pattern.test(label))?.kind ?? "hdmi");
  const status = getStatus(source, capabilities);
  return {
    kind,
    status,
    statusLabel: STATUS_LABELS[status],
    disconnected: source.connected === false && !source.active && !capabilities.recognized && !capabilities.pinned,
  };
};
