import { ActionIcon, Button, Group, Menu, Text, Title } from "@mantine/core";
import { MoreHorizontal, Monitor, Pencil, Search, Trash2 } from "lucide-react";
import type { SavedTv } from "../contracts";
import type { TvManager } from "../useTvManager";
import styles from "../styles.module.css";

const DAY_MS = 24 * 60 * 60 * 1000;

export function lastConnected(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Connection time unavailable";
  const today = new Date();
  const elapsed = Math.round(
    (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) /
      DAY_MS,
  );
  if (elapsed === 0) return "Last connected today";
  if (elapsed === 1) return "Last connected yesterday";
  return `Last connected ${date.toLocaleDateString()}`;
}

interface TvSelectionProps {
  manager: TvManager;
  onAddress(profile?: SavedTv): void;
  onRename(profile: SavedTv): void;
  onForget(profile: SavedTv): void;
}

export function TvSelection({ manager, onAddress, onRename, onForget }: TvSelectionProps) {
  const disabled = Boolean(manager.busy) || !manager.ready;
  const searching = manager.busy?.scope === "discovery";
  const newCandidates = manager.candidates?.filter(
    (candidate) =>
      !manager.profiles.some((profile) => profile.host === candidate.host && profile.model === candidate.model),
  );
  return (
    <div className={styles.selection}>
      <Title order={1}>Your TVs</Title>
      <Text c="dimmed" mt={8}>
        Select a saved TV or find one on your network.
      </Text>
      {!manager.loading && manager.profiles.length > 0 && (
        <section className={styles.savedSection} aria-label="Saved TVs">
          <Title order={2} size="h3">
            Saved TVs ({manager.profiles.length})
          </Title>
          <div className={styles.tvList}>
            {manager.profiles.map((profile) => (
              <div className={styles.tvRow} key={profile.id}>
                <Monitor size={30} strokeWidth={1.6} className={styles.monitorIcon} />
                <div className={styles.tvName}>
                  <Text fw={600}>{profile.name}</Text>
                  <Text c="dimmed" size="sm">
                    {profile.model}
                  </Text>
                </div>
                <Text c="dimmed" size="sm" className={styles.lastConnected}>
                  {lastConnected(profile.checked_at)}
                </Text>
                <Group gap="xs" wrap="nowrap" className={styles.rowActions}>
                  <Button
                    aria-label={`Connect to ${profile.name}`}
                    disabled={disabled}
                    onClick={() => void manager.connect(profile.host, profile.id)}
                  >
                    Connect<span className={styles.srOnly}> to {profile.name}</span>
                  </Button>
                  <Menu position="bottom-end" shadow="md">
                    <Menu.Target>
                      <ActionIcon
                        variant="default"
                        size="lg"
                        disabled={Boolean(manager.busy)}
                        aria-label={`Options for ${profile.name}`}
                      >
                        <MoreHorizontal size={19} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item onClick={() => onAddress(profile)}>Connect at another address</Menu.Item>
                      <Menu.Item leftSection={<Pencil size={15} />} onClick={() => onRename(profile)}>
                        Rename
                      </Menu.Item>
                      <Menu.Divider />
                      <Menu.Item color="red" leftSection={<Trash2 size={15} />} onClick={() => onForget(profile)}>
                        Forget TV
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className={styles.discovered} aria-labelledby="network-tvs-heading" aria-busy={searching}>
        <Group justify="space-between" gap="sm">
          <Title id="network-tvs-heading" order={2} size="h3">
            TVs on your network
          </Title>
          <Group gap="sm" ml="auto" justify="flex-end">
            <Button
              leftSection={<Search size={17} />}
              loading={searching}
              disabled={disabled}
              onClick={() => void manager.discover()}
            >
              Search for TVs
            </Button>
            <Button variant="default" disabled={disabled} onClick={() => onAddress()}>
              Enter IP address
            </Button>
          </Group>
        </Group>
        {manager.candidates?.length === 0 && (
          <Text c="dimmed" mt="md">
            No TVs found. Check that the TV is on and on the same network, or enter its IP address.
          </Text>
        )}
        {Boolean(newCandidates?.length) && (
          <div className={styles.tvList}>
            {newCandidates?.map((candidate) => (
              <Group className={styles.candidate} key={candidate.host} justify="space-between" wrap="nowrap">
                <div>
                  <Text fw={600}>{candidate.name}</Text>
                  <Text c="dimmed" size="sm">
                    {candidate.model} · {candidate.host}
                  </Text>
                </div>
                <Button
                  aria-label={`Connect to ${candidate.name} at ${candidate.host}`}
                  variant="light"
                  disabled={disabled}
                  onClick={() => void manager.connect(candidate.host)}
                >
                  Connect
                  <span className={styles.srOnly}>
                    {" "}
                    to {candidate.name} at {candidate.host}
                  </span>
                </Button>
              </Group>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
