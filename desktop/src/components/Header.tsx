import { AppShell, Box, Burger, Group, Text } from "@mantine/core";
import styles from "../styles.module.css";

export const DESKTOP_HEADER = { height: 64 };
export const MOBILE_HEADER = { height: { base: 52, sm: 0 } };

function Wordmark() {
  return <Text className={styles.wordmark}>AeroTizen</Text>;
}

export function SidebarBrand() {
  return (
    <Box className={`${styles.brandSurface} ${styles.sidebarBrand}`} visibleFrom="sm">
      <Wordmark />
    </Box>
  );
}

export function Header({ sidebar }: { sidebar?: { opened: boolean; toggle(): void } }) {
  return (
    <AppShell.Header className={styles.brandSurface} hiddenFrom={sidebar ? "sm" : undefined}>
      <Group className={sidebar ? styles.mobileHeaderContent : styles.headerContent} gap="xs" wrap="nowrap">
        {sidebar && (
          <Burger
            className={styles.headerControl}
            opened={sidebar.opened}
            onClick={sidebar.toggle}
            color="white"
            size="sm"
            aria-label="Toggle sidebar"
            aria-expanded={sidebar.opened}
            aria-controls="desktop-sidebar"
          />
        )}
        <Wordmark />
      </Group>
    </AppShell.Header>
  );
}
