import type { ClockFormatter } from "../../contracts/launcher";
import { ChoiceGroup } from "../components/ChoiceGroup";
import { ChoiceOption } from "../components/ChoiceOption";
import type { SettingsSectionProps } from "../types";

const CLOCK_LAYOUT_OPTIONS = [
  { value: "classic", label: "Compact clock" },
  { value: "custom", label: "Custom clock" },
] as const;

const CLOCK_STYLE_OPTIONS = [
  { value: "vertical", label: "Large Vertical" },
  { value: "horizontal", label: "Horizontal" },
  { value: "minimal", label: "Thin" },
  { value: "bold", label: "Bold" },
] as const;

const TIME_FORMATS = ["12", "24"] as const;

interface Props extends SettingsSectionProps {
  clock: ClockFormatter;
  openedAt: number;
}
export const ClockSettings = ({ settings, actions, clock, openedAt }: Props) => {
  const now = new Date(openedAt);
  const dateStyle = clock.dateStyle(settings.dateFormat);
  return (
    <>
      <h3>Clock layout</h3>
      <ChoiceGroup
        id="clock-layouts"
        label="Clock layout"
        value={settings.clockLayout}
        options={CLOCK_LAYOUT_OPTIONS}
        onSelect={actions.setClockLayout}
      />
      <div hidden={settings.clockLayout !== "custom"}>
        <h3>Clock style</h3>
        <ChoiceGroup
          id="clock-styles"
          label="Clock style"
          value={settings.aeroClockStyle}
          options={CLOCK_STYLE_OPTIONS}
          onSelect={actions.setClockStyle}
        />
      </div>
      <h3>Date &amp; time</h3>
      <div id="time-formats" class="units">
        {TIME_FORMATS.map((format) => (
          <ChoiceOption
            key={format}
            id={"time:" + format}
            selected={settings.showTime !== false && settings.timeFormat === format}
            onSelect={() => actions.setTimeFormat(format)}
          >
            {clock.formatTime(now, format) + "  (" + format + "-hour)"}
          </ChoiceOption>
        ))}
        <ChoiceOption
          id="time:none"
          selected={settings.showTime === false}
          onSelect={() => actions.setTimeFormat("none")}
        >
          No time
        </ChoiceOption>
      </div>
      <div id="date-formats" class="units">
        {clock.DATE_FORMATS.map((format) => (
          <ChoiceOption
            key={format.id}
            id={"date:" + format.id}
            selected={dateStyle === format.id}
            onSelect={() => actions.setDateFormat(format.id)}
          >
            {format.id === "none" ? "No date" : format.format(now)}
          </ChoiceOption>
        ))}
      </div>
    </>
  );
};
