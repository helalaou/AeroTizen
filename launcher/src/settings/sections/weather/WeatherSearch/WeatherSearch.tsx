import type { JSX, RefObject } from "preact";

import { useTranslation } from "../../../../shared/i18n/useTranslation";
import { SettingsControl } from "../../../components/SettingsControl/SettingsControl";

import styles from "./WeatherSearch.module.css";

interface Props {
  inputRef: RefObject<HTMLInputElement>;
  onInput: JSX.GenericEventHandler<HTMLInputElement>;
  onSelect(): void;
  value: string;
}

export const WeatherSearch = ({ inputRef, onInput, onSelect, value }: Props) => {
  const { t } = useTranslation();
  return (
    <SettingsControl class={styles.search} focusKey="weather:query" onClick={onSelect}>
      <input
        class={styles.input}
        ref={inputRef}
        type="text"
        maxLength={80}
        value={value}
        placeholder={t("weather.searchPlaceholder")}
        aria-label={t("weather.locationLabel")}
        onInput={onInput}
      />
    </SettingsControl>
  );
};
