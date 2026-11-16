import { Alert, AppShell, Loader, LoadingOverlay, Modal, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { Header } from "./components/Header";
import { LauncherPanel } from "./components/LauncherPanel";
import { SelectedTvView } from "./components/SelectedTvView";
import { TvDialogs } from "./components/TvDialogs";
import type { TvDialog } from "./components/TvDialogs";
import { TvSelection } from "./components/TvSelection";
import { TvSidebar } from "./components/TvSidebar";
import type { DesktopService, TvPage } from "./contracts";
import { useTvManager } from "./useTvManager";
import styles from "./styles.module.css";

interface AppProps {
  service: DesktopService;
}

export function App({ service }: AppProps) {
  const manager = useTvManager(service);
  const [page, setPage] = useState<TvPage>("overview");
  const [dialog, setDialog] = useState<TvDialog | null>(null);
  const [about, setAbout] = useState(false);
  const [menuOpened, setMenuOpened] = useState(false);
  const selected = manager.selected;
  const busy = Boolean(manager.busy);
  const busyMessage = manager.busy?.message ?? (manager.loading ? "Loading saved TVs…" : null);
  const appLoading = Boolean(busyMessage) && manager.busy?.scope !== "discovery";
  const backendVersion = manager.backend?.version;
  const goToPage = (next: TvPage) => {
    setPage(next);
    setMenuOpened(false);
  };
  const connect = async (host: string, profileId?: string) => {
    const success = await manager.connect(host, profileId);
    if (success) {
      if (!manager.selected) setPage("overview");
      setMenuOpened(false);
    }
    return success;
  };
  const openDialog = (next: TvDialog) => {
    manager.clearError();
    setDialog(next);
  };
  const checkConnection = () => {
    if (selected) void manager.connect(selected.host, selected.id);
  };

  function tvContent() {
    if (!selected) {
      return (
        <TvSelection
          manager={{ ...manager, connect }}
          onAddress={(profile) => openDialog({ kind: "address", profile })}
          onRename={(profile) => openDialog({ kind: "rename", profile })}
          onForget={(profile) => openDialog({ kind: "forget", profile })}
        />
      );
    }
    if (page === "overview") {
      return (
        <SelectedTvView
          profile={selected}
          backendVersion={backendVersion}
          latestLauncher={manager.latestLauncher}
          onLauncher={() => goToPage("launcher")}
        />
      );
    }
    return (
      <LauncherPanel
        key={selected.id}
        profile={selected}
        releases={manager.launcherReleases}
        busy={busy}
        onInstall={manager.installLauncher}
        onRetryVersions={manager.retryLauncherVersions}
      />
    );
  }
  return (
    <AppShell
      header={{ height: 64 }}
      navbar={selected ? { width: 224, breakpoint: "sm", collapsed: { mobile: !menuOpened } } : undefined}
      padding={0}
    >
      <AppShell.Header>
        <Header
          selected={Boolean(selected)}
          menuOpened={menuOpened}
          toggleMenu={() => setMenuOpened((current) => !current)}
          onAbout={() => setAbout(true)}
        />
      </AppShell.Header>
      {selected && (
        <TvSidebar
          profile={selected}
          page={page}
          busy={busy}
          canCheck={!busy && manager.ready}
          onCheck={checkConnection}
          onPage={goToPage}
          onBack={() => {
            manager.back();
            goToPage("overview");
          }}
        />
      )}
      <AppShell.Main className={styles.main}>
        <div className={styles.body} aria-busy={appLoading}>
          {manager.error && !dialog && (
            <div className={styles.feedback}>
              <Alert
                role="alert"
                color="red"
                title="Could not finish"
                withCloseButton
                closeButtonLabel="Dismiss error"
                onClose={manager.clearError}
              >
                {manager.error}
              </Alert>
            </div>
          )}
          {tvContent()}
        </div>
      </AppShell.Main>
      <div role="status" className={styles.srOnly}>
        {busyMessage}
      </div>
      {appLoading && !dialog && (
        <LoadingOverlay
          visible
          pos="fixed"
          zIndex={110}
          overlayProps={{ backgroundOpacity: 0.8 }}
          loaderProps={{
            children: (
              <Stack align="center" gap="sm" aria-hidden="true">
                <Loader />
                <Text fw={500}>{busyMessage}</Text>
              </Stack>
            ),
          }}
        />
      )}
      {dialog && (
        <TvDialogs
          key={`${dialog.kind}-${dialog.profile?.id ?? "new"}`}
          dialog={dialog}
          busy={busy}
          error={manager.error}
          onClose={() => setDialog(null)}
          onConnect={connect}
          onRename={manager.rename}
          onForget={manager.forget}
        />
      )}
      <Modal opened={about} onClose={() => setAbout(false)} title="About AeroTizen" centered>
        <Stack gap="sm">
          <Text>Manage your Samsung TVs from your computer.</Text>
          <Text size="sm" c="dimmed">
            Desktop app 0.1.0 · Backend {manager.backend?.version ?? "unavailable"}
          </Text>
        </Stack>
      </Modal>
    </AppShell>
  );
}
