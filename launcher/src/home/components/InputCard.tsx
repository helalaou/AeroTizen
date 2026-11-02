import type { LucideIcon } from "lucide-preact";
import { Gamepad2, HdmiPort, Monitor, RectangleEllipsis, Tv } from "lucide-preact";

import type { InputSource } from "../../contracts/launcher";
import { Icon } from "../../shared/icons/Icon";
import type { InputKind } from "../presentation/inputs";
import { getInputPresentation } from "../presentation/inputs";
import type { HomeEnvironment } from "../types";

import { HomeControl } from "./HomeControl";

const INPUT_ICONS = { tv: Tv, game: Gamepad2, pc: Monitor, box: RectangleEllipsis, hdmi: HdmiPort } satisfies Record<
  InputKind,
  LucideIcon
>;

export const InputCard = ({ env, source, glass }: { env: HomeEnvironment; source: InputSource; glass: boolean }) => {
  const label = env.runtime.inputs.label(source);
  const port = env.runtime.inputs.portName(source);
  const { kind, status, statusLabel, disconnected } = getInputPresentation(source, label, {
    recognized: Boolean(env.runtime.inputs.hasRecognizedDevice?.(source)),
    pinned: Boolean(env.runtime.inputs.alwaysVisible?.(source)),
  });
  return (
    <HomeControl
      env={env}
      controlKey={"input:" + source.type + ":" + source.number}
      className={"tile" + (glass ? " input-card input-card--" + status : "") + (disconnected ? " off" : "")}
      title={label}
    >
      <span class="input-card__icon">
        <Icon icon={INPUT_ICONS[kind]} />
      </span>
      {glass ? <span class="input-card__status">{statusLabel}</span> : null}
      <div class="name">
        {label}
        {label !== port && source.type !== "TV" ? <div class="sub">{port}</div> : null}
      </div>
    </HomeControl>
  );
};
