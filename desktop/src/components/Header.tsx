import { ActionIcon, Burger, Group, Menu, Text } from "@mantine/core";
import { Info, LogIn, LogOut, MoreHorizontal } from "lucide-react";
import styles from "../styles.module.css";

interface HeaderProps {
  selected: boolean;
  menuOpened: boolean;
  toggleMenu(): void;
  onAbout(): void;
  samsung?: { signedIn: boolean; email: string | null; busy: boolean; signIn(): void; signOut(): void };
}

export function Header({ selected, menuOpened, toggleMenu, onAbout, samsung }: HeaderProps) {
  return (
    <Group className={styles.header} justify="space-between">
      <Group gap="sm">
        {selected && (
          <Burger hiddenFrom="sm" opened={menuOpened} onClick={toggleMenu} size="sm" aria-label="Toggle TV menu" />
        )}
        <Text className={styles.wordmark}>AeroTizen</Text>
      </Group>
      <Menu position="bottom-end" shadow="md">
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" size="lg" aria-label="App menu">
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
    </Group>
  );
}
