import { ActionIcon, AppShell, Button, Divider, Group, NavLink, Stack, Text } from "@mantine/core";
import { ArrowLeft, LayoutDashboard, LayoutGrid, Package, RefreshCw } from "lucide-react";
import type { TvPage, SavedTv } from "../contracts";
import styles from "../styles.module.css";

const PAGES = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "launcher", label: "Launcher", icon: Package },
  { key: "apps", label: "Apps", icon: LayoutGrid },
] as const;

interface TvSidebarProps {
  profile: SavedTv;
  page: TvPage;
  busy: boolean;
  navigationDisabled: boolean;
  canCheck: boolean;
  onCheck(): void;
  onBack(): void;
  onPage(page: TvPage): void;
}

export function TvSidebar({
  profile,
  page,
  busy,
  navigationDisabled,
  canCheck,
  onCheck,
  onBack,
  onPage,
}: TvSidebarProps) {
  return (
    <AppShell.Navbar p="md" className={styles.sidebar}>
      <Button
        variant="subtle"
        justify="flex-start"
        leftSection={<ArrowLeft size={18} />}
        px="xs"
        mb="lg"
        disabled={busy}
        onClick={onBack}
      >
        Back to TVs
      </Button>
      <Group gap="xs" mb="lg" px="xs" wrap="nowrap">
        <div className={styles.sidebarName}>
          <Text fw={600} truncate>
            {profile.name}
          </Text>
          <Text c="dimmed" size="sm" truncate>
            {profile.model}
          </Text>
        </div>
        <ActionIcon
          type="button"
          variant="subtle"
          color="gray"
          size="lg"
          aria-label="Refresh TV connection"
          title="Refresh TV connection"
          disabled={!canCheck}
          onClick={onCheck}
        >
          <RefreshCw size={17} aria-hidden="true" />
        </ActionIcon>
      </Group>
      <Stack component="nav" aria-label="TV actions" gap={2}>
        {PAGES.map(({ key, label, icon: Icon }) => (
          <div key={key}>
            {key === "launcher" && <Divider my="xs" />}
            <NavLink
              component="button"
              type="button"
              label={label}
              leftSection={<Icon size={18} />}
              disabled={navigationDisabled}
              active={page === key}
              aria-current={page === key ? "page" : undefined}
              onClick={() => onPage(key)}
            />
          </div>
        ))}
      </Stack>
    </AppShell.Navbar>
  );
}
