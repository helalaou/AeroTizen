import type { ClockFormatter } from "../../contracts/launcher";
import { useTranslation } from "../../shared/i18n/useTranslation";
import { isDateVisible } from "../../shared/time/clockVisibility";
import { ChoiceGroup } from "../components/ChoiceGroup";
import { ChoiceOption } from "../components/ChoiceOption/ChoiceOption";
import { ControlGroup } from "../components/ControlGroup/ControlGroup";
import { SettingsField } from "../components/SettingsField/SettingsField";
import { SettingsToggle } from "../components/SettingsToggle/SettingsToggle";
import type { SettingsSectionProps } from "../types";

const CLOCK_LAYOUT_OPTIONS = [
  { value: "classic", labelKey: "clock.compact" },
  { value: "vertical", labelKey: "clock.vertical" },
  { value: "horizontal", labelKey: "clock.horizontal" },
  { value: "minimal", labelKey: "clock.thin" },
  { value: "bold", labelKey: "clock.bold" },
] as const;

const TIME_FORMATS = ["12", "24"] as const;

const TIME_ZONE_OPTIONS = [
  { value: "tv", labelKey: "clock.timeZoneTv" },
  { value: "weather", labelKey: "clock.timeZoneWeather" },
] as const;

const NUMERAL_OPTIONS = [
  { value: "latn", labelKey: "clock.digitsWestern" },
  { value: "arab", labelKey: "clock.digitsArabic" },
] as const;

interface Props extends SettingsSectionProps {
  clock: ClockFormatter;
  openedAt: number;
}
export const ClockSettings = ({ settings, actions, clock, openedAt }: Props) => {
  const { t, language } = useTranslation();
  const now = new Date(openedAt);
  return (
    <>
      <SettingsField title={t("clock.layout")} topAligned>
        <ChoiceGroup
          id="clock-layouts"
          label={t("clock.layout")}
          value={settings.clockLayout === "classic" ? "classic" : settings.aeroClockStyle}
          options={CLOCK_LAYOUT_OPTIONS}
          onSelect={actions.setClockLayout}
        />
      </SettingsField>
      <SettingsField title={t("clock.showTime")}>
        <SettingsToggle
          focusKey="time-visibility"
          label={t("clock.showTime")}
          checked={settings.showTime}
          onChange={actions.setTimeVisible}
        />
      </SettingsField>
      <SettingsField title={t("clock.timeFormat")} hidden={!settings.showTime}>
        <ControlGroup id="time-formats" label={t("clock.timeFormat")}>
          {TIME_FORMATS.map((format) => {
            const example = clock.formatTime(now, format);
            return (
              <ChoiceOption
                key={format}
                id={"time:" + format}
                fill
                selected={settings.showTime !== false && settings.timeFormat === format}
                onSelect={() => actions.setTimeFormat(format)}
                ariaLabel={t("clock.timeExample", { time: example, hours: format })}
              >
                {example}
              </ChoiceOption>
            );
          })}
        </ControlGroup>
      </SettingsField>
      <SettingsField title={t("clock.showDate")}>
        <SettingsToggle
          focusKey="date-visibility"
          label={t("clock.showDate")}
          checked={isDateVisible(settings)}
          onChange={actions.setDateVisible}
        />
      </SettingsField>
      <SettingsField title={t("clock.dateFormat")} hidden={!isDateVisible(settings)} topAligned>
        <ControlGroup id="date-formats" label={t("clock.dateFormat")}>
          {clock.DATE_FORMATS.filter((format) => format.id !== "none").map((format) => (
            <ChoiceOption
              key={format.id}
              id={"date:" + format.id}
              fill
              selected={settings.dateFormat === format.id}
              onSelect={() => actions.setDateFormat(format.id)}
            >
              {format.format(now)}
            </ChoiceOption>
          ))}
        </ControlGroup>
      </SettingsField>
      <SettingsField
        title={t("clock.timeZone")}
        description={t("clock.timeZoneHint")}
        hidden={!settings.showTime && !isDateVisible(settings)}
      >
        <ChoiceGroup
          id="time-zone"
          label={t("clock.timeZone")}
          value={settings.timeZone}
          options={TIME_ZONE_OPTIONS}
          onSelect={actions.setTimeZone}
        />
      </SettingsField>
      {language === "ar" && (
        <SettingsField title={t("clock.digits")}>
          <ChoiceGroup
            id="numerals"
            label={t("clock.digits")}
            value={settings.numerals}
            options={NUMERAL_OPTIONS}
            onSelect={actions.setNumerals}
          />
        </SettingsField>
      )}
      <SettingsField title={t("appearance.network")}>
        <SettingsToggle
          focusKey="network-visibility"
          label={t("appearance.networkVisibility")}
          checked={settings.showNetwork !== false}
          onChange={actions.setNetworkVisible}
        />
      </SettingsField>
    </>
  );
};
