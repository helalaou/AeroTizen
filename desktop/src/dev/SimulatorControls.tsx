import {
  Affix,
  Alert,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  NativeSelect,
  NumberInput,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { FlaskConical, Plus, Trash2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { errorMessage } from "../contracts";
import { createScenario, createTv, MAX_RESPONSE_DELAY_MS, OPERATIONS, TV_PRESETS } from "./scenarios";
import type { SimulatorOperation, TvPreset } from "./scenarios";
import { MAX_SIMULATED_TVS, parseScenario } from "./store";
import type { SimulatorStore } from "./store";
import { TvEditor } from "./TvEditor";

const DRAWER_Z_INDEX = 400;
const CONTROL_Z_INDEX = 300;
interface SimulatorControlsProps {
  store: SimulatorStore;
  onReload(): void;
}

function ScenarioJson({ store, onReload }: SimulatorControlsProps) {
  const [json, setJson] = useState(() => JSON.stringify(store.getSnapshot(), null, 2));
  const [error, setError] = useState<string | null>(null);
  return (
    <Stack>
      <Text size="sm">
        Copy this JSON to keep or share a scenario. Load JSON replaces the simulated state and returns to the TV list.
      </Text>
      <Textarea
        label="Scenario JSON"
        value={json}
        onChange={(event) => setJson(event.currentTarget.value)}
        minRows={16}
        autosize
        maxRows={24}
        styles={{ input: { fontFamily: "monospace", fontSize: 12 } }}
        spellCheck={false}
      />
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      <Button
        onClick={() => {
          try {
            store.replace(parseScenario(json));
            onReload();
          } catch (error) {
            setError(errorMessage(error));
          }
        }}
      >
        Load JSON
      </Button>
    </Stack>
  );
}

function Requests({ store }: Pick<SimulatorControlsProps, "store">) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [operation, setOperation] = useState<SimulatorOperation>("connect");
  const [message, setMessage] = useState("Simulated request failed. Please retry.");
  return (
    <Stack>
      <NumberInput
        label="Response delay (ms)"
        description="Use a longer delay to check loading and cancellation."
        value={state.delay_ms}
        min={0}
        max={MAX_RESPONSE_DELAY_MS}
        step={100}
        allowDecimal={false}
        onChange={(value) => {
          if (typeof value === "number" && Number.isFinite(value))
            store.update((current) => ({ ...current, delay_ms: Math.max(0, Math.min(MAX_RESPONSE_DELAY_MS, value)) }));
        }}
      />
      <Divider />
      <NativeSelect
        label="Request to fail"
        value={operation}
        data={Object.entries(OPERATIONS).map(([value, label]) => ({ value, label }))}
        onChange={(event) => setOperation(event.currentTarget.value as SimulatorOperation)}
      />
      <TextInput label="Error message" value={message} onChange={(event) => setMessage(event.currentTarget.value)} />
      <Button
        disabled={!message.trim()}
        onClick={() => store.update((current) => ({ ...current, fail_next: { operation, message: message.trim() } }))}
      >
        Fail next request
      </Button>
      {state.fail_next && (
        <Alert color="orange" title="Failure armed">
          <Text size="sm">
            The next {OPERATIONS[state.fail_next.operation].toLowerCase()} request will fail. Other requests continue
            normally.
          </Text>
          <Button
            variant="subtle"
            color="orange"
            mt="xs"
            onClick={() => store.update((current) => ({ ...current, fail_next: null }))}
          >
            Clear failure
          </Button>
        </Alert>
      )}
      <Text size="sm" c="dimmed">
        These controls apply to the next request. Close this panel and use the app normally. Cancelled reads do not
        consume the failure.
      </Text>
    </Stack>
  );
}

export function SimulatorControls({ store, onReload }: SimulatorControlsProps) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [opened, setOpened] = useState(false);
  const [selectedId, setSelectedId] = useState(state.tvs[0]?.profile.id);
  const [preset, setPreset] = useState<TvPreset>("fresh");
  const [editorRevision, setEditorRevision] = useState(0);
  const selected = state.tvs.find((tv) => tv.profile.id === selectedId) ?? state.tvs[0];
  const reload = () => {
    onReload();
    setOpened(false);
  };
  return (
    <>
      <Affix position={{ bottom: 16, right: 16 }} zIndex={CONTROL_Z_INDEX}>
        <Button
          color="violet"
          leftSection={<FlaskConical size={17} />}
          onClick={() => {
            setEditorRevision((value) => value + 1);
            setOpened(true);
          }}
        >
          TV simulator
        </Button>
      </Affix>
      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        position="right"
        size="lg"
        title="TV simulator"
        zIndex={DRAWER_Z_INDEX}
        closeButtonProps={{ "aria-label": "Close TV simulator" }}
      >
        <Stack gap="md">
          <Group>
            <Badge color="violet">Local development</Badge>
            <Text size="sm">
              {state.tvs.length} simulated {state.tvs.length === 1 ? "TV" : "TVs"}
            </Text>
          </Group>
          <Text size="sm" c="dimmed">
            All TV and Samsung actions use local data. Changes are saved in this browser. Real TVs and accounts are not
            used.
          </Text>
          {store.getWarning() && (
            <Alert color="orange" role="alert">
              {store.getWarning()}
            </Alert>
          )}
          <Tabs defaultValue="tvs" keepMounted={false}>
            <Tabs.List grow>
              <Tabs.Tab value="tvs">TVs</Tabs.Tab>
              <Tabs.Tab value="requests">Requests</Tabs.Tab>
              <Tabs.Tab value="json">Scenario JSON</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="tvs" pt="md">
              <Stack gap="md">
                <NativeSelect
                  label="New TV preset"
                  value={preset}
                  data={Object.entries(TV_PRESETS).map(([value, label]) => ({ value, label }))}
                  onChange={(event) => setPreset(event.currentTarget.value as TvPreset)}
                />
                <Button
                  variant="light"
                  leftSection={<Plus size={16} />}
                  disabled={state.tvs.length >= MAX_SIMULATED_TVS}
                  onClick={() => {
                    const used = new Set(state.tvs.map((tv) => tv.profile.host));
                    const index = Array.from({ length: MAX_SIMULATED_TVS }, (_, index) => index).find(
                      (index) => !used.has(`192.0.2.${index + 20}`),
                    )!;
                    const tv = createTv(preset, index);
                    store.replace({ ...state, tvs: [...state.tvs, tv] });
                    setSelectedId(tv.profile.id);
                    onReload();
                  }}
                >
                  Add TV
                </Button>
                <Divider />
                {selected ? (
                  <>
                    <NativeSelect
                      label="TV to edit"
                      value={selected.profile.id}
                      data={state.tvs.map((tv) => ({
                        value: tv.profile.id,
                        label: `${tv.profile.name} · ${tv.profile.host}`,
                      }))}
                      onChange={(event) => setSelectedId(event.currentTarget.value)}
                    />
                    <TvEditor
                      key={`${selected.profile.id}-${editorRevision}`}
                      tv={selected}
                      onSave={(tv) => {
                        store.replace({
                          ...store.getSnapshot(),
                          tvs: store
                            .getSnapshot()
                            .tvs.map((current) => (current.profile.id === tv.profile.id ? tv : current)),
                        });
                        reload();
                      }}
                    />
                    <Button
                      variant="subtle"
                      color="red"
                      leftSection={<Trash2 size={16} />}
                      onClick={() => {
                        store.replace({
                          ...state,
                          tvs: state.tvs.filter((tv) => tv.profile.id !== selected.profile.id),
                        });
                        onReload();
                      }}
                    >
                      Delete simulated TV
                    </Button>
                  </>
                ) : (
                  <Text size="sm">No TVs yet. Add one above to test discovery and first-time setup.</Text>
                )}
                <Divider />
                <Text size="sm" c="dimmed">
                  Reset returns to the TV list. It replaces simulated TVs, installed apps and saved progress.
                </Text>
                <Group grow>
                  <Button
                    variant="default"
                    onClick={() => {
                      store.replace(createScenario());
                      reload();
                    }}
                  >
                    Reset starter TVs
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => {
                      store.replace(createScenario(true));
                      reload();
                    }}
                  >
                    Start empty
                  </Button>
                </Group>
              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="requests" pt="md">
              <Requests store={store} />
            </Tabs.Panel>
            <Tabs.Panel value="json" pt="md">
              <ScenarioJson store={store} onReload={reload} />
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Drawer>
    </>
  );
}
