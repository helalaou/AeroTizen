import type { ClockFormatter } from "../../contracts/launcher";
import { useTranslation } from "../../shared/i18n/useTranslation";
import { ChoiceGroup } from "../components/ChoiceGroup";
import { ChoiceOption } from "../components/ChoiceOption";
import { SettingsSection } from "../components/SettingsSection";
import type { SettingsSectionProps } from "../types";

const CLOCK_LAYOUT_OPTIONS = [
  { value: "classic", labelKey: "clock.compact" },
  { value: "vertical", labelKey: "clock.vertical" },
  { value: "horizontal", labelKey: "clock.horizontal" },
  { value: "minimal", labelKey: "clock.thin" },
  { value: "bold", labelKey: "clock.bold" },
] as const;

const NETWORK_VISIBILITY_OPTIONS = [
  { value: true, labelKey: "common.show" },
  { value: false, labelKey: "common.hide" },
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
      <SettingsSection title={t("clock.layout")}>
        <ChoiceGroup
          id="clock-layouts"
          label={t("clock.layout")}
          value={settings.clockLayout === "classic" ? "classic" : settings.aeroClockStyle}
          options={CLOCK_LAYOUT_OPTIONS}
          onSelect={actions.setClockLayout}
        />
      </SettingsSection>
      <SettingsSection title={t("clock.dateAndTime")}>
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
      </SettingsSection>
      <SettingsSection title={t("appearance.network")}>
        <ChoiceGroup
          id="network-visibility"
          label={t("appearance.networkVisibility")}
          value={settings.showNetwork !== false}
          options={NETWORK_VISIBILITY_OPTIONS}
          onSelect={actions.setNetworkVisible}
        />
      </SettingsSection>
    </>
  );
};
