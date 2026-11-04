import type { ClockFormatter } from "../../contracts/launcher";
import { useTranslation } from "../../shared/i18n/useTranslation";
import { ChoiceGroup } from "../components/ChoiceGroup";
import { ChoiceOption } from "../components/ChoiceOption";
import type { SettingsSectionProps } from "../types";

const CLOCK_LAYOUT_OPTIONS = [
  { value: "classic", labelKey: "clock.compact" },
  { value: "custom", labelKey: "clock.custom" },
] as const;

const CLOCK_STYLE_OPTIONS = [
  { value: "vertical", labelKey: "clock.vertical" },
  { value: "horizontal", labelKey: "clock.horizontal" },
  { value: "minimal", labelKey: "clock.thin" },
  { value: "bold", labelKey: "clock.bold" },
] as const;

const TIME_FORMATS = ["12", "24"] as const;

interface Props extends SettingsSectionProps {
  clock: ClockFormatter;
  openedAt: number;
}
export const ClockSettings = ({ settings, actions, clock, openedAt }: Props) => {
  const { t } = useTranslation();
  const now = new Date(openedAt);
  const dateStyle = clock.dateStyle(settings.dateFormat);
  return (
    <>
      <h3>{t("clock.layout")}</h3>
      <ChoiceGroup
        id="clock-layouts"
        label={t("clock.layout")}
        value={settings.clockLayout}
        options={CLOCK_LAYOUT_OPTIONS}
        onSelect={actions.setClockLayout}
      />
      <div hidden={settings.clockLayout !== "custom"}>
        <h3>{t("clock.style")}</h3>
        <ChoiceGroup
          id="clock-styles"
          label={t("clock.style")}
          value={settings.aeroClockStyle}
          options={CLOCK_STYLE_OPTIONS}
          onSelect={actions.setClockStyle}
        />
      </div>
      <h3>{t("clock.dateAndTime")}</h3>
      <div id="time-formats" class="units">
        {TIME_FORMATS.map((format) => (
          <ChoiceOption
            key={format}
            id={"time:" + format}
            selected={settings.showTime !== false && settings.timeFormat === format}
            onSelect={() => actions.setTimeFormat(format)}
          >
            {t("clock.timeExample", { time: clock.formatTime(now, format), hours: format })}
          </ChoiceOption>
        ))}
        <ChoiceOption
          id="time:none"
          selected={settings.showTime === false}
          onSelect={() => actions.setTimeFormat("none")}
        >
          {t("clock.noTime")}
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
            {format.id === "none" ? t("clock.noDate") : format.format(now)}
          </ChoiceOption>
        ))}
      </div>
    </>
  );
};
