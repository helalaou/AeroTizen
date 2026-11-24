import { Divider, NavLink, Stack } from "@mantine/core";
import { Info, LogIn, LogOut, ScrollText } from "lucide-react";
import styles from "../styles.module.css";

interface SidebarActionsProps {
  samsung?: { signedIn: boolean; email: string | null; busy: boolean; signIn(): void; signOut(): void };
  logsActive: boolean;
  logsDisabled: boolean;
  onLogs(): void;
  onAbout(): void;
}

export function SidebarActions({ samsung, logsActive, logsDisabled, onLogs, onAbout }: SidebarActionsProps) {
  return (
    <Stack component="nav" aria-label="Desktop actions" gap={2} className={styles.sidebarActions}>
      <Divider my="xs" />
      {samsung && (
        <NavLink
          component="button"
          type="button"
          label={samsung.signedIn ? "Sign out of Samsung" : "Sign in to Samsung"}
          description={samsung.signedIn ? (samsung.email ?? "Signed in to Samsung") : undefined}
          leftSection={samsung.signedIn ? <LogOut size={18} /> : <LogIn size={18} />}
          disabled={samsung.busy}
          onClick={samsung.signedIn ? samsung.signOut : samsung.signIn}
        />
      )}
      <NavLink
        component="button"
        type="button"
        label="Logs"
        leftSection={<ScrollText size={18} />}
        active={logsActive}
        aria-current={logsActive ? "page" : undefined}
        disabled={logsDisabled}
        onClick={onLogs}
      />
      <NavLink
        component="button"
        type="button"
        label="About AeroTizen"
        leftSection={<Info size={18} />}
        onClick={onAbout}
      />
    </Stack>
  );
}
