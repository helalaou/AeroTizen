import type { ClockFormatter } from "../../contracts/launcher";
import { ChoiceGroup } from "../components/ChoiceGroup";
import { ChoiceOption } from "../components/ChoiceOption";
import type { SettingsSectionProps } from "../types";
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
        options={[
          ["classic", "Compact clock"],
          ["custom", "Custom clock"],
        ]}
        onSelect={actions.setClockLayout}
      />
      <div hidden={settings.clockLayout !== "custom"}>
        <h3>Clock style</h3>
        <ChoiceGroup
          id="clock-styles"
          label="Clock style"
          value={settings.aeroClockStyle}
          options={[
            ["vertical", "Large Vertical"],
            ["horizontal", "Horizontal"],
            ["minimal", "Thin"],
            ["bold", "Bold"],
          ]}
          onSelect={actions.setClockStyle}
        />
      </div>
      <h3>Date &amp; time</h3>
      <div id="time-formats" class="units">
        {(["12", "24"] as const).map((format) => (
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
