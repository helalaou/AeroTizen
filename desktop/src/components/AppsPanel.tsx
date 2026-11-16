import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  CloseButton,
  Group,
  List,
  Modal,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { RefreshCw, Search, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import type { AppRemovalStatus, NamedAppRemovalOutcome, TvAppPackage } from "../contracts";
import styles from "../styles.module.css";

interface AppsPanelProps {
  tvName: string;
  packages: TvAppPackage[] | null;
  loading: boolean;
  error: string | null;
  removal: NamedAppRemovalOutcome[];
  appRefusals: ReadonlyMap<string, string>;
  onRefresh(): void;
  onDismissResults(): void;
  onRemove(packages: TvAppPackage[]): void;
}

interface RemovalSelection {
  inventory: TvAppPackage[];
  ids: Set<string>;
  open: boolean;
}

const REMOVAL_LABELS: Record<AppRemovalStatus, string> = {
  removed: "Removed",
  refused: "Failed to uninstall",
  still_installed: "Failed to uninstall",
  unverified: "Could not verify",
  not_attempted: "Not attempted",
};
const PLACEHOLDER_NAME_WIDTHS = [132, 98, 154, 114, 168, 126, 146, 105];

function PackageNames({ item }: { item: TvAppPackage }) {
  const companions = item.apps.filter((name) => name !== item.name);
  return (
    <>
      <Text component="span" display="block" size="sm" fw={500} style={{ overflowWrap: "anywhere" }}>
        {item.name}
      </Text>
      {companions.length > 0 && (
        <Text component="span" display="block" size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>
          {companions.join(", ")}
        </Text>
      )}
    </>
  );
}

export function AppsPanel({
  tvName,
  packages,
  loading,
  error,
  removal,
  appRefusals,
  onRefresh,
  onDismissResults,
  onRemove,
}: AppsPanelProps) {
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<RemovalSelection | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const currentSelection = selection?.inventory === packages ? selection : null;
  const picked = packages?.filter((item) => !item.protected && currentSelection?.ids.has(item.id)) ?? [];
  const allRemoved = removal.every((item) => item.status === "removed");
  const query = search.trim().toLowerCase();
  const matches =
    packages?.filter(({ id, name, apps }) =>
      [id, name, ...apps].some((value) => value.toLowerCase().includes(query)),
    ) ?? [];

  function changeSearch(value: string) {
    setSearch(value);
    results.current?.scrollTo({ top: 0 });
  }

  function select(item: TvAppPackage, checked: boolean) {
    if (!packages || item.protected) return;
    const ids = new Set(currentSelection?.ids);
    if (checked) ids.add(item.id);
    else ids.delete(item.id);
    setSelection({ inventory: packages, ids, open: false });
  }

  function showReview(open: boolean) {
    if (currentSelection) setSelection({ ...currentSelection, open });
  }

  function confirmRemoval() {
    showReview(false);
    results.current?.scrollTo({ top: 0 });
    onRemove(picked);
  }

  return (
    <div className={`${styles.detailContent} ${styles.appsContent}`}>
      <Group justify="space-between">
        <Title order={1}>Apps</Title>
        <ActionIcon
          type="button"
          variant="subtle"
          color="gray"
          size="lg"
          loading={loading}
          aria-label="Refresh apps"
          title="Refresh apps"
          onClick={onRefresh}
        >
          <RefreshCw size={17} aria-hidden="true" />
        </ActionIcon>
      </Group>
      <div role="status" className={styles.srOnly}>
        {loading && "Loading installed apps…"}
      </div>
      <Paper withBorder p="lg" className={styles.appsPanel} aria-busy={loading}>
        <Stack gap="xs" className={styles.appsSearch}>
          <TextInput
            ref={searchInput}
            label="Search installed apps"
            type="search"
            leftSection={<Search size={16} aria-hidden="true" />}
            rightSection={
              search && (
                <CloseButton
                  aria-label="Clear search"
                  title="Clear search"
                  onClick={() => {
                    changeSearch("");
                    searchInput.current?.focus();
                  }}
                />
              )
            }
            value={search}
            onChange={(event) => changeSearch(event.currentTarget.value)}
          />
          <Group gap="xs">
            {loading && <Skeleton width={90} height={14} aria-hidden="true" />}
            {packages && (
              <Text c="dimmed" size="sm" role="status">
                {query && `${matches.length} of `}
                {packages.length} {packages.length === 1 ? "package" : "packages"}
              </Text>
            )}
            <Button
              ml="auto"
              color="red"
              variant="light"
              disabled={loading || picked.length === 0}
              onClick={() => showReview(true)}
            >
              Remove{picked.length > 0 && ` (${picked.length})`}
            </Button>
          </Group>
        </Stack>
        {removal.length > 0 && (
          <Alert
            color={allRemoved ? "green" : "orange"}
            title="Removal results"
            role="status"
            className={styles.appsRemovalResults}
            tabIndex={0}
            withCloseButton
            closeButtonLabel="Dismiss removal results"
            onClose={onDismissResults}
          >
            <Stack gap="xs">
              <List size="sm">
                {removal.map(({ id, name, status, detail }) => (
                  <List.Item key={id}>
                    <span>
                      {name} · {REMOVAL_LABELS[status]}
                    </span>
                    {detail && (
                      <Text component="span" display="block" size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>
                        {detail}
                      </Text>
                    )}
                  </List.Item>
                ))}
              </List>
              {removal.some((item) => item.status === "refused") && (
                <Text size="sm">You can check for a Delete option in Apps → Settings on the TV.</Text>
              )}
            </Stack>
          </Alert>
        )}
        <Stack
          ref={results}
          role="region"
          aria-label="App search results"
          tabIndex={0}
          gap="md"
          className={styles.appsResults}
        >
          {!loading && packages === null && (
            <Stack align="flex-start" gap="xs">
              {error && (
                <Text size="sm" role="alert" c="red">
                  {error}
                </Text>
              )}
              <Button variant="default" onClick={onRefresh}>
                Retry
              </Button>
            </Stack>
          )}
          {!loading && packages && matches.length === 0 && (
            <Text c="dimmed" size="sm">
              {query ? "No apps match your search." : "The TV reported no installed apps."}
            </Text>
          )}
          {(loading || matches.length > 0) && (
            <Table verticalSpacing="sm" aria-label="Installed app packages" aria-hidden={loading || undefined}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th scope="col">App</Table.Th>
                  <Table.Th scope="col" ta="right">
                    Removal
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {loading
                  ? PLACEHOLDER_NAME_WIDTHS.map((width, index) => (
                      <Table.Tr key={width}>
                        <Table.Td>
                          <Group gap="sm" wrap="nowrap">
                            <Skeleton width={20} height={20} radius="sm" />
                            <Skeleton width={`min(${width}px, 60%)`} height={14} />
                          </Group>
                        </Table.Td>
                        <Table.Td ta="right" w={96}>
                          {index % 3 === 0 && <Skeleton width={72} height={18} radius="xl" ml="auto" />}
                        </Table.Td>
                      </Table.Tr>
                    ))
                  : matches.map((item) => {
                      const checked = currentSelection?.ids.has(item.id) ?? false;
                      return (
                        <Table.Tr
                          key={item.id}
                          className={item.protected ? undefined : styles.appPackageRow}
                          onClick={(event) => {
                            // The native label and checkbox already toggle selection.
                            if (event.target instanceof Element && !event.target.closest("input, label")) {
                              select(item, !checked);
                            }
                          }}
                        >
                          <Table.Td>
                            <Checkbox
                              label={<PackageNames item={item} />}
                              checked={checked}
                              disabled={item.protected}
                              onChange={(event) => select(item, event.currentTarget.checked)}
                            />
                          </Table.Td>
                          <Table.Td ta="right">
                            {item.protected && (
                              <Badge variant="light" color="gray">
                                Protected
                              </Badge>
                            )}
                            {!item.protected && appRefusals.get(item.id) === item.revision && (
                              <Badge
                                variant="light"
                                color="blue"
                                title="Check for Delete in Apps → Settings on the TV."
                              >
                                Delete on TV
                              </Badge>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
              </Table.Tbody>
            </Table>
          )}
        </Stack>
      </Paper>
      <Modal
        centered
        title="Remove apps?"
        opened={Boolean(currentSelection?.open && picked.length)}
        onClose={() => showReview(false)}
      >
        <Stack gap="md">
          <Alert color="red" icon={<TriangleAlert size={18} aria-hidden="true" />}>
            Removing apps can erase their saved data and sign-ins.
          </Alert>
          <Text size="sm">
            These packages will be removed from <strong>{tvName}</strong> if the TV allows it.
          </Text>
          <List spacing="sm">
            {picked.map((item) => (
              <List.Item key={item.id}>
                <PackageNames item={item} />
              </List.Item>
            ))}
          </List>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => showReview(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={confirmRemoval}>
              Remove
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
