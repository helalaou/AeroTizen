import { ActionIcon, AppShell, Burger, Group, Menu, Text } from "@mantine/core";
import { Info, LogIn, LogOut, MoreHorizontal } from "lucide-react";
import styles from "../styles.module.css";

export const DESKTOP_HEADER = { height: 64 };

interface HeaderProps {
  tvMenu?: { opened: boolean; toggle(): void };
  onAbout?(): void;
  samsung?: { signedIn: boolean; email: string | null; busy: boolean; signIn(): void; signOut(): void };
}

export function Header({ tvMenu, onAbout, samsung }: HeaderProps) {
  return (
    <AppShell.Header className={styles.header}>
      <Group className={styles.headerContent} justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          {tvMenu && (
            <Burger
              className={styles.headerControl}
              hiddenFrom="sm"
              opened={tvMenu.opened}
              onClick={tvMenu.toggle}
              color="white"
              size="sm"
              aria-label="Toggle TV menu"
              aria-expanded={tvMenu.opened}
            />
          )}
          <Text className={styles.wordmark}>AeroTizen</Text>
        </Group>
        {onAbout && (
          <Menu position="bottom-end" shadow="md">
            <Menu.Target>
              <ActionIcon
                className={styles.headerControl}
                variant="subtle"
                color="white"
                size="lg"
                aria-label="App menu"
              >
                <MoreHorizontal size={22} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {samsung && (
                <>
                  {samsung.signedIn && <Menu.Label>{samsung.email ?? "Signed in to Samsung"}</Menu.Label>}
                  <Menu.Item
                    leftSection={samsung.signedIn ? <LogOut size={16} /> : <LogIn size={16} />}
                    disabled={samsung.busy}
                    onClick={samsung.signedIn ? samsung.signOut : samsung.signIn}
                  >
                    {samsung.signedIn ? "Sign out of Samsung" : "Sign in to Samsung"}
                  </Menu.Item>
                  <Menu.Divider />
                </>
              )}
              <Menu.Item leftSection={<Info size={16} />} onClick={onAbout}>
                About AeroTizen
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
    </AppShell.Header>
  );
}
