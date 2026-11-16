import { ActionIcon, Burger, Group, Menu, Text } from "@mantine/core";
import { Info, MoreHorizontal } from "lucide-react";
import styles from "../styles.module.css";

interface HeaderProps {
  selected: boolean;
  menuOpened: boolean;
  toggleMenu(): void;
  onAbout(): void;
}

export function Header({ selected, menuOpened, toggleMenu, onAbout }: HeaderProps) {
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
          <Menu.Item leftSection={<Info size={16} />} onClick={onAbout}>
            About AeroTizen
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
