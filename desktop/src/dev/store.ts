import { validHost } from "../contracts";
import { compareLauncherVersions } from "../services/launcherVersions";
import { validButtonName } from "../services/buttonNames";
import { createScenario, MAX_RESPONSE_DELAY_MS, OPERATIONS, synchronizeRoot } from "./scenarios";
import type { SimulatorState } from "./scenarios";

export const SIMULATOR_STORAGE_KEY = "aerotizen.desktop.simulator.v1";
export const MAX_SCENARIO_BYTES = 1024 * 1024;
export const MAX_SIMULATED_TVS = 100;
const ID = /^[a-f0-9]{64}$/;
const ROOT_PHASES = [
  "not_configured",
  "prepared",
  "installed",
  "root_requested",
  "waiting_boot",
  "active",
  "removing",
  "removed",
];

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function record(value: unknown): Record<string, unknown> {
  check(typeof value === "object" && value !== null && !Array.isArray(value), "Expected a JSON object.");
  return value as Record<string, unknown>;
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function nullableText(value: unknown): boolean {
  return value === null || typeof value === "string";
}
function version(value: unknown): boolean {
  return value === null || (typeof value === "string" && compareLauncherVersions(value, value) !== null);
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(text);
}
function homeSettings(value: unknown) {
  const settings = record(value);
  check(
    ["home_button_app", "home_app", "startup_app", "startup_backup_app"].every((key) => nullableText(settings[key])),
    "Home assignments must be strings or null.",
  );
  check(
    settings.smart_hub_autostart === null || typeof settings.smart_hub_autostart === "boolean",
    "Invalid Smart Hub autostart setting.",
  );
}

/** Reject malformed imports before they can reach a normal app screen. */
export function parseScenario(json: string): SimulatorState {
  check(new TextEncoder().encode(json).length <= MAX_SCENARIO_BYTES, "Scenario JSON must be no larger than 1 MiB.");
  const state = record(JSON.parse(json));
  check(state.schema_version === 1, "This scenario has an unsupported schema version.");
  // Scenarios saved before source selection was added also use live releases by default.
  const release_source = state.release_source ?? "github";
  check(release_source === "github" || release_source === "custom", "Choose GitHub or custom launcher releases.");
  check(Array.isArray(state.tvs) && state.tvs.length <= MAX_SIMULATED_TVS, `Use at most ${MAX_SIMULATED_TVS} TVs.`);
  const identities = new Set<string>();
  const hosts = new Set<string>();
  for (const item of state.tvs) {
    const tv = record(item);
    const profile = record(tv.profile);
    check(
      typeof profile.id === "string" && ID.test(profile.id) && profile.identity_sha256 === profile.id,
      "Each TV needs a unique 64-character hexadecimal identity.",
    );
    check(!identities.has(profile.id), "TV identities must be unique.");
    identities.add(profile.id);
    check(
      typeof profile.host === "string" && validHost(profile.host) && !hosts.has(profile.host),
      "Each TV needs a unique IPv4 address.",
    );
    hosts.add(profile.host);
    check(
      ["name", "model", "developer_mode", "developer_host", "checked_at"].every((key) => text(profile[key])),
      "TV name, model and connection details are required.",
    );
    check(version(profile.launcher_version), "Use a launcher version such as 3.4.0, or null.");
    check(typeof profile.launcher_signing_ready === "boolean", "Signing certificate status must be a boolean.");
    check(profile.transport === "paired_root" || profile.transport === "developer", "Invalid TV connection type.");
    if (profile.technical_details !== undefined) {
      const details = record(profile.technical_details);
      check(
        ["model_code", "tizen_version", "architecture", "platform", "root_runtime_version"].every((key) =>
          nullableText(details[key]),
        ) &&
          (details.firmware_build === undefined || nullableText(details.firmware_build)),
        "Invalid technical details.",
      );
    }
    if (profile.home_routing_mode !== undefined)
      check(
        ["watcher", "native", "hold", "blocked"].includes(String(profile.home_routing_mode)),
        "Invalid Home routing mode.",
      );
    if (profile.native_home_settings !== undefined) homeSettings(profile.native_home_settings);
    if (profile.home_backup !== undefined) {
      const backup = record(profile.home_backup);
      check(["saved", "missing", "unreadable"].includes(String(backup.status)), "Invalid Home backup status.");
      if (backup.status === "saved")
        check(
          typeof backup.captured_at === "string" && Number.isFinite(Date.parse(backup.captured_at)),
          "A saved backup needs a valid capture date.",
        );
    }
    check(
      ["saved", "online", "discoverable"].every((key) => typeof tv[key] === "boolean"),
      "TV visibility and power settings must be booleans.",
    );
    const root = record(tv.root);
    check(tv.removal_restarted === undefined || typeof tv.removal_restarted === "boolean", "Invalid removal restart.");
    check(root.removal_prepared === undefined || typeof root.removal_prepared === "boolean", "Invalid removal status.");
    check(ROOT_PHASES.includes(String(root.phase)), "Invalid Root setup phase.");
    check(
      [
        "root_available",
        "setup_complete",
        "update_available",
        "update_pending",
        "automatic_boot_verified",
        "bootstrap_completed",
        "recovery_saved",
      ].every((key) => typeof root[key] === "boolean"),
      "Invalid Root status flags.",
    );
    check(
      root.automatic_startup === null || typeof root.automatic_startup === "boolean",
      "Invalid Root automatic startup status.",
    );
    check(
      version(root.runtime_version) &&
        text(root.target_runtime_version) &&
        version(root.target_runtime_version) &&
        nullableText(root.original_pc_host),
      "Invalid root access version or recovery address.",
    );
    check(Array.isArray(tv.apps), "Apps must be an array.");
    const packages = new Set<string>();
    for (const item of tv.apps) {
      const app = record(item);
      check(
        text(app.id) &&
          !packages.has(app.id) &&
          text(app.name) &&
          strings(app.apps) &&
          typeof app.protected === "boolean" &&
          typeof app.revision === "string" &&
          ID.test(app.revision),
        "Each app needs a unique package ID, name, app labels, protection flag and revision.",
      );
      packages.add(app.id);
    }
    const mappings = record(tv.buttons);
    check(
      ["ready", "pairing_required", "helper_update_required"].includes(String(mappings.status)),
      "Invalid button mapping status.",
    );
    if (mappings.status === "ready") {
      check(Array.isArray(mappings.buttons) && nullableText(mappings.discovery_detail), "Invalid button inventory.");
      const names = new Set<string>();
      for (const item of mappings.buttons) {
        const button = record(item);
        check(
          typeof button.button === "string" &&
            validButtonName(button.button) &&
            !names.has(button.button.toLowerCase()),
          "Remote buttons need unique valid names.",
        );
        names.add(button.button.toLowerCase());
        check(
          ["default", "app", "disabled"].includes(String(button.mode)) &&
            nullableText(button.app_id) &&
            nullableText(button.app_name) &&
            typeof button.active === "boolean",
          "Invalid button assignment.",
        );
        if (button.mode === "app") check(text(button.app_id), "An app assignment needs an app ID.");
      }
    }
    homeSettings(tv.original_home);
    check(
      typeof record(tv.original_home).first_screen === "string" &&
        typeof tv.backup_revision === "string" &&
        ID.test(tv.backup_revision),
      "Invalid original Home backup.",
    );
    check(
      strings(tv.removal_refusals) && version(tv.local_app_version),
      "Invalid app removal or installation settings.",
    );
  }
  check(Array.isArray(state.releases), "Releases must be an array.");
  const versions = new Set<string>();
  for (const item of state.releases) {
    const release = record(item);
    check(
      text(release.version) &&
        version(release.version) &&
        !versions.has(release.version) &&
        Array.isArray(release.sections),
      "Releases need unique versions and change sections.",
    );
    versions.add(release.version);
    for (const item of release.sections) {
      const section = record(item);
      check(nullableText(section.heading) && strings(section.changes), "Invalid release notes.");
    }
  }
  check(typeof state.signed_in === "boolean", "Samsung sign-in status must be a boolean.");
  check(
    typeof state.delay_ms === "number" &&
      Number.isFinite(state.delay_ms) &&
      state.delay_ms >= 0 &&
      state.delay_ms <= MAX_RESPONSE_DELAY_MS,
    `Response delay must be between 0 and ${MAX_RESPONSE_DELAY_MS} ms.`,
  );
  if (state.fail_next !== null) {
    const failure = record(state.fail_next);
    check(
      typeof failure.operation === "string" && Object.hasOwn(OPERATIONS, failure.operation) && text(failure.message),
      "Choose a request and an error message for the simulated failure.",
    );
  }
  const local = record(state.local_app);
  check(
    ["selection_id", "name", "app_id", "package_id"].every((key) => text(local[key])) &&
      text(local.version) &&
      version(local.version),
    "Invalid local app fixture.",
  );
  check(
    version(local.current_version) && typeof local.replacing === "boolean",
    "Invalid local app replacement status.",
  );
  const parsed = state as unknown as SimulatorState;
  return { ...parsed, release_source, tvs: parsed.tvs.map(synchronizeRoot) };
}

type ScenarioStorage = Pick<Storage, "getItem" | "setItem">;
export function createSimulatorStore(storage?: ScenarioStorage, initial = createScenario()) {
  let state = structuredClone(initial);
  let generation = 0;
  let session = new AbortController();
  let warning: string | null = null;
  const listeners = new Set<() => void>();
  try {
    const saved = storage?.getItem(SIMULATOR_STORAGE_KEY);
    if (saved) state = parseScenario(saved);
  } catch {
    warning = "The saved scenario could not be loaded. Starter TVs are shown instead.";
  }
  function update(change: (current: SimulatorState) => SimulatorState) {
    state = change(state);
    try {
      storage?.setItem(SIMULATOR_STORAGE_KEY, JSON.stringify(state));
    } catch {
      warning = "Browser storage is unavailable. This scenario will not survive a reload.";
    }
    listeners.forEach((listener) => listener());
  }
  function invalidateRequests() {
    generation += 1;
    session.abort();
    session = new AbortController();
  }
  return {
    getSnapshot: () => state,
    getGeneration: () => generation,
    getRequestSignal: () => session.signal,
    getWarning: () => warning,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update,
    replace: (next: SimulatorState) => {
      const checked = parseScenario(JSON.stringify(next));
      invalidateRequests();
      warning = null;
      update(() => checked);
    },
    invalidateRequests,
  };
}
export type SimulatorStore = ReturnType<typeof createSimulatorStore>;
