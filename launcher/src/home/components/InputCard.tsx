import { Gamepad2, HdmiPort, Monitor, RectangleEllipsis, Tv } from "lucide-preact";

import type { InputSource } from "../../contracts/launcher";
import { Icon } from "../../shared/icons/Icon";
import type { HomeEnvironment } from "../types";

import { HomeControl } from "./HomeControl";

export const InputCard = ({ env, source, glass }: { env: HomeEnvironment; source: InputSource; glass: boolean }) => {
  const label = env.runtime.inputs.label(source),
    port = env.runtime.inputs.portName(source);
  const kind =
    source.type === "TV"
      ? "tv"
      : /xbox|playstation|ps\d|switch|nintendo|game|console/i.test(label)
        ? "game"
        : /pc|computer|mac|laptop/i.test(label)
          ? "pc"
          : /cable|box|roku|fire|apple|shield|chromecast|blu|dvd|satellite/i.test(label)
            ? "box"
            : "hdmi";
  const glyph = { tv: Tv, game: Gamepad2, pc: Monitor, box: RectangleEllipsis, hdmi: HdmiPort }[kind];
  const recognized = env.runtime.inputs.hasRecognizedDevice?.(source);
  const pinned = env.runtime.inputs.alwaysVisible?.(source);
  const status =
    source.type === "TV"
      ? "live"
      : source.active
        ? "active"
        : source.connected
          ? "connected"
          : recognized
            ? "recognized"
            : pinned
              ? "pinned"
              : "empty";
  const statusLabel = {
    live: "TV",
    active: "ACTIVE",
    connected: "ON",
    recognized: "RECOGNISED",
    pinned: "PINNED",
    empty: "OFF",
  }[status];
  const disconnected = source.connected === false && !source.active && !recognized && !pinned;
  return (
    <HomeControl
      env={env}
      controlKey={"input:" + source.type + ":" + source.number}
      className={"tile" + (glass ? " input-card input-card--" + status : "") + (disconnected ? " off" : "")}
      title={label}
    >
      <span class="input-card__icon">
        <Icon icon={glyph} />
      </span>
      {glass ? <span class="input-card__status">{statusLabel}</span> : null}
      <div class="name">
        {label}
        {label !== port && source.type !== "TV" ? <div class="sub">{port}</div> : null}
      </div>
    </HomeControl>
  );
};
