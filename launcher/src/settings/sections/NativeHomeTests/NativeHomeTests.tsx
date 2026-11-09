import { useEffect, useMemo } from "preact/hooks";

import type {
  NativeHomeReport,
  NativeHomeTestAction,
  NativeHomeTestSnapshot,
  NativeHomeValue,
} from "../../../contracts/nativeHomeTest";
import { useStore } from "../../../shared/hooks/useStore";
import type { MessageKey } from "../../../shared/i18n/catalogues";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import { SettingsControl } from "../../components/SettingsControl/SettingsControl";
import { SettingsHint } from "../../components/SettingsHint/SettingsHint";
import { SettingsSection } from "../../components/SettingsSection/SettingsSection";
import { createNativeHomeTestService } from "../../services/createNativeHomeTestService";

import styles from "./NativeHomeTests.module.css";

const MESSAGES: Record<NativeHomeTestSnapshot["message"], MessageKey> = {
  changed: "nativeTest.changed",
  loading: "nativeTest.loading",
  ready: "nativeTest.ready",
  getPassed: "nativeTest.getPassed",
  getBlocked: "nativeTest.getBlocked",
  setPassed: "nativeTest.setPassed",
  failed: "nativeTest.failed",
  interrupted: "nativeTest.interrupted",
  offline: "nativeTest.offline",
  tvRequired: "nativeTest.tvRequired",
};
const ACTIONS = [
  { action: "get", label: "nativeTest.get" },
  { action: "set", label: "nativeTest.set" },
] as const;
const valueText = (value: NativeHomeValue): string => {
  if (value.status === "ok") {
    return String(value.value);
  }
  const code = value.native_code ?? value.errno;
  if (code !== undefined && code !== null) {
    return value.status + " (" + code + ")";
  }
  return value.error || value.reason || value.status;
};
const results = (report: NativeHomeReport | null) => {
  const query = report?.query;
  if (!query) {
    return [];
  }
  if (query.steps) {
    return query.steps.map((step) => ({ key: step.key, value: valueText(step) }));
  }
  const values = Object.entries(query.settings || {});
  if (query.main_operation) {
    values.unshift(["operation/main", query.main_operation]);
  }
  return values.map(([key, value]) => ({ key, value: valueText(value) }));
};

export const NativeHomeTests = ({ active }: { active: boolean }) => {
  const service = useMemo(() => createNativeHomeTestService(), []);
  const state = useStore(service);
  const { t } = useTranslation();
  useEffect(() => {
    if (!active) {
      return;
    }
    void service.refresh();
    return () => service.dispose();
  }, [active, service]);
  const unavailable = (action: NativeHomeTestAction) =>
    !state.ready ||
    Boolean(state.busy) ||
    (action === "get" ? state.report?.status !== "not_run" : !state.report?.can_set || Boolean(state.report.set_test));
  const set = state.report?.set_test;
  const latest = set || state.report;
  let message = t(MESSAGES[state.message]);
  if (state.busy === "get") {
    message = t("nativeTest.getRunning");
  }
  if (state.busy === "set") {
    message = t("nativeTest.setRunning");
  }
  return (
    <SettingsSection title={t("nativeTest.title")} description={t("nativeTest.hint")} label={t("nativeTest.title")}>
      <div class={styles.buttons}>
        {ACTIONS.map(({ action, label }) => (
          <SettingsControl
            key={action}
            focusKey={"native-test:" + action}
            class={styles.button}
            role="button"
            aria-disabled={unavailable(action)}
            onClick={() => {
              void service.run(action);
            }}
          >
            {t(label)}
          </SettingsControl>
        ))}
        <SettingsControl
          focusKey="native-test:refresh"
          class={styles.button}
          role="button"
          aria-disabled={Boolean(state.busy)}
          onClick={() => {
            void service.refresh();
          }}
        >
          {t("nativeTest.refresh")}
        </SettingsControl>
      </div>
      <SettingsHint role="status" aria-live="polite" data-native-test-status>
        {message}
      </SettingsHint>
      {latest?.stage && latest.status !== "not_run" && (
        <p class={styles.detail}>
          <code>{latest.stage}</code> ·{" "}
          <code>{latest.query?.error || latest.execution?.error || latest.execution?.method || latest.status}</code>
        </p>
      )}
      {state.report?.query && (
        <div class={styles.results}>
          <h4 class={styles.heading}>{t("nativeTest.get")}</h4>
          <dl class={styles.values}>
            {results(state.report).map((row) => (
              <SettingsControl
                key={row.key}
                focusKey={"native-test:get:" + row.key}
                class={styles.row}
                role="group"
                aria-label={row.key + " " + row.value}
              >
                <dt class={styles.key}>{row.key}</dt>
                <dd class={styles.value}>{row.value}</dd>
              </SettingsControl>
            ))}
          </dl>
          {set && (
            <>
              <h4 class={styles.heading}>{t("nativeTest.set")}</h4>
              <dl class={styles.values}>
                {results(set).map((row) => (
                  <SettingsControl
                    key={row.key}
                    focusKey={"native-test:set:" + row.key}
                    class={styles.row}
                    role="group"
                    aria-label={row.key + " " + row.value}
                  >
                    <dt class={styles.key}>{row.key}</dt>
                    <dd class={styles.value}>{row.value}</dd>
                  </SettingsControl>
                ))}
              </dl>
            </>
          )}
        </div>
      )}
    </SettingsSection>
  );
};
