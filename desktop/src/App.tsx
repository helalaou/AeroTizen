import { Alert, AppShell, Loader, LoadingOverlay, Modal, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { AppsPanel } from "./components/AppsPanel";
import { ButtonMappingPanel } from "./components/ButtonMappingPanel";
import { DESKTOP_HEADER, Header } from "./components/Header";
import { LauncherPanel } from "./components/LauncherPanel";
import { LocalAppInstallDialog } from "./components/LocalAppInstallDialog";
import { RootAccessPanel } from "./components/RootAccessPanel";
import { RootRemovalDialog } from "./components/RootRemovalDialog";
import { RootSetupDialog } from "./components/RootSetupDialog";
import { RootUpdateDialog } from "./components/RootUpdateDialog";
import { SelectedTvView } from "./components/SelectedTvView";
import { SamsungSignInDialog } from "./components/SamsungSignInDialog";
import { TvActionView } from "./components/TvActionView";
import { TvDialogs } from "./components/TvDialogs";
import type { TvDialog } from "./components/TvDialogs";
import { TvSelection } from "./components/TvSelection";
import { TvSidebar } from "./components/TvSidebar";
import type { DesktopService, TvPage } from "./contracts";
import { showToast, Toasts } from "./Toasts";
import { useTvManager } from "./useTvManager";
import { useSamsungAccount } from "./useSamsungAccount";
import styles from "./styles.module.css";

interface AppProps {
  service: DesktopService;
}

export function App({ service }: AppProps) {
  const manager = useTvManager(service);
  const samsung = useSamsungAccount(service.samsung);
  const [signInDialog, setSignInDialog] = useState<
    { kind: "account" } | { kind: "install"; version: string; confirmed: boolean } | null
  >(null);
  const [page, setPage] = useState<TvPage>("overview");
  const [dialog, setDialog] = useState<TvDialog | null>(null);
  const [about, setAbout] = useState(false);
  const [localInstallOpened, setLocalInstallOpened] = useState(false);
  const [rootSetupOpened, setRootSetupOpened] = useState(false);
  const [rootUpdateOpened, setRootUpdateOpened] = useState(false);
  const [rootRemovalOpened, setRootRemovalOpened] = useState(false);
  const [menuOpened, setMenuOpened] = useState(false);
  const selected = manager.selected;
  const busy = Boolean(manager.busy);
  const busyMessage = manager.busy?.message ?? (manager.loading ? "Loading saved TVs…" : null);
  const appLoading = manager.loading || manager.busy?.scope === "app";
  const backendVersion = manager.backend?.version;
  const loadRootStatus = manager.loadRootStatus;
  useEffect(() => {
    if (selected && page === "overview" && !busy) loadRootStatus(selected.id);
  }, [selected, page, busy, loadRootStatus]);

  const goToPage = (next: TvPage) => {
    setPage(next);
    setMenuOpened(false);
    if (next === page) return;
    manager.cancelPageRead();
    if (next === "apps" && selected) {
      manager.clearAppRemoval();
      manager.loadApps(selected.id);
    }
    if (next === "buttons" && selected) manager.loadButtons(selected.id);
    if (next === "root" && selected) manager.loadRootStatus(selected.id);
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
  const checkConnection = async () => {
    if (!selected) return;
    const connected = await manager.connect(selected.host, selected.id);
    if (connected && page === "apps") manager.loadApps(selected.id);
    if (connected && page === "buttons") manager.loadButtons(selected.id);
    if (connected && page === "root") manager.loadRootStatus(selected.id);
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
          rootAccessStatus={!manager.rootLoading && !manager.rootError ? manager.rootStatus : null}
          onLauncher={() => goToPage("launcher")}
          onRootAccess={() => goToPage("root")}
        />
      );
    }
    if (page === "apps") {
      return (
        <AppsPanel
          key={selected.id}
          tvName={selected.name}
          packages={manager.apps}
          removal={manager.appRemoval}
          appRefusals={manager.appRefusals}
          error={manager.appsError}
          loading={manager.appsLoading}
          onRefresh={() => manager.loadApps(selected.id)}
          onDismissResults={manager.clearAppRemoval}
          onRemove={(picked) => void manager.removeApps(selected.id, picked)}
          onInstall={service.localApps ? () => setLocalInstallOpened(true) : undefined}
          installDisabled={busy}
        />
      );
    }
    if (page === "root") {
      const revealRecovery = service.rootAccess?.revealRecovery;
      return (
        <RootAccessPanel
          key={selected.id}
          status={manager.rootStatus}
          loading={manager.rootLoading}
          error={manager.rootError}
          busy={busy}
          onRefresh={() => manager.loadRootStatus(selected.id)}
          onSetup={() => setRootSetupOpened(true)}
          onUpdate={() => setRootUpdateOpened(true)}
          onRemove={manager.removeRoot ? () => setRootRemovalOpened(true) : undefined}
          onRevealRecovery={revealRecovery ? () => revealRecovery(selected.id) : undefined}
        />
      );
    }
    if (page === "home") {
      const apply = manager.applyNativeHome;
      const restore = manager.restoreHomeBackup;
      return (
        <TvActionView
          key={selected.id}
          page="home"
          profile={selected}
          onApplyNativeHome={apply ? (reportError) => apply(selected.id, reportError) : undefined}
          readHomeBackup={service.readHomeBackup}
          onRestoreBackup={
            restore ? (capturedAt, reportError) => restore(selected.id, capturedAt, reportError) : undefined
          }
        />
      );
    }
    if (page === "buttons") {
      return (
        <ButtonMappingPanel
          key={selected.id}
          tvName={selected.name}
          mappings={manager.buttonMappings}
          loading={manager.buttonsLoading}
          error={manager.buttonsError}
          activation={manager.buttonActivation}
          onRefresh={() => manager.loadButtons(selected.id)}
          onRootAccess={() => goToPage("root")}
          actions={
            service.buttonActions
              ? {
                  busy,
                  apps: manager.buttonApps,
                  appsLoading: manager.buttonAppsLoading,
                  appsError: manager.buttonAppsError,
                  changeError: manager.buttonChangeError,
                  loadApps: () => manager.loadButtonApps(selected.id),
                  cancelApps: manager.cancelButtonApps,
                  change: (change, reportError) => manager.changeButton(selected.id, change, reportError),
                  updateInventory: (change, reportError) =>
                    manager.updateButtonInventory(selected.id, change, reportError),
                }
              : undefined
          }
        />
      );
    }
    return (
      <LauncherPanel
        key={selected.id}
        profile={selected}
        releases={manager.launcherReleases}
        busy={appLoading}
        canInstall={!busy}
        canSetupSigning={Boolean(service.samsung)}
        onInstall={(version, confirmed) => {
          if (selected.launcher_signing_ready || !service.samsung) {
            void manager.installLauncher(version, confirmed);
          } else {
            setSignInDialog({ kind: "install", version, confirmed });
          }
        }}
        onRetryVersions={manager.retryLauncherVersions}
        releasesLoading={manager.launcherReleasesLoading}
      />
    );
  }
  return (
    <AppShell
      header={DESKTOP_HEADER}
      navbar={selected ? { width: 224, breakpoint: "sm", collapsed: { mobile: !menuOpened } } : undefined}
      padding={0}
    >
      <Toasts />
      <Header
        tvMenu={selected ? { opened: menuOpened, toggle: () => setMenuOpened((current) => !current) } : undefined}
        onAbout={() => setAbout(true)}
        samsung={
          service.samsung
            ? {
                signedIn: samsung.account !== null,
                email: samsung.account?.email ?? null,
                busy: samsung.loading || samsung.busy || busy,
                signIn: () => setSignInDialog({ kind: "account" }),
                signOut: () => void samsung.signOut(),
              }
            : undefined
        }
      />
      {selected && (
        <TvSidebar
          profile={selected}
          page={page}
          busy={busy}
          navigationDisabled={appLoading}
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
        <div
          className={styles.body}
          data-viewport={selected && page === "launcher" ? "launcher" : undefined}
          aria-busy={appLoading}
        >
          {samsung.error && (
            <div className={styles.feedback}>
              <Alert
                role="alert"
                color="red"
                withCloseButton
                onClose={samsung.clearError}
                closeButtonLabel="Dismiss Samsung error"
              >
                {samsung.error}
              </Alert>
            </div>
          )}
          {manager.error && !dialog && !signInDialog && (
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
      {signInDialog && (
        <SamsungSignInDialog
          signedIn={samsung.account !== null}
          signIn={samsung.signIn}
          tvName={signInDialog.kind === "install" ? selected?.name : undefined}
          prepareCertificates={
            signInDialog.kind === "install" && selected
              ? async (reportError) => {
                  const prepared = await manager.prepareCertificates(selected.id, reportError);
                  if (!prepared) await samsung.refresh();
                  return prepared;
                }
              : undefined
          }
          install={
            signInDialog.kind === "install"
              ? () => manager.installLauncher(signInDialog.version, signInDialog.confirmed)
              : undefined
          }
          onComplete={(success) => {
            setSignInDialog(null);
            if (success && signInDialog.kind === "account") showToast("Signed in to Samsung.");
          }}
        />
      )}
      {localInstallOpened && selected && (
        <LocalAppInstallDialog
          key={selected.id}
          profile={selected}
          signedIn={samsung.account !== null}
          choose={manager.chooseLocalApp}
          install={manager.installLocalApp}
          signIn={samsung.signIn}
          prepareCertificates={async (reportError) => {
            const prepared = await manager.prepareCertificates(selected.id, reportError);
            if (!prepared) await samsung.refresh();
            return prepared;
          }}
          onClose={() => setLocalInstallOpened(false)}
        />
      )}
      {rootSetupOpened && selected && manager.rootStatus && (
        <RootSetupDialog
          key={selected.id}
          profile={selected}
          status={manager.rootStatus}
          signedIn={samsung.account !== null}
          signIn={samsung.signIn}
          prepareCertificates={async (reportError) => {
            const prepared = await manager.prepareCertificates(selected.id, reportError);
            if (!prepared) await samsung.refresh();
            return prepared;
          }}
          setup={manager.setupRoot}
          simulateRestart={manager.simulateRootRestart}
          onRefresh={() => manager.loadRootStatus(selected.id)}
          onClose={() => setRootSetupOpened(false)}
        />
      )}
      {rootUpdateOpened && selected && manager.rootStatus && (
        <RootUpdateDialog
          key={selected.id}
          profile={selected}
          status={manager.rootStatus}
          upgrade={manager.upgradeRoot}
          simulateRestart={manager.simulateRootRestart}
          onRefresh={() => manager.loadRootStatus(selected.id)}
          onClose={() => setRootUpdateOpened(false)}
        />
      )}
      {rootRemovalOpened && selected && manager.rootStatus && manager.removeRoot && (
        <RootRemovalDialog
          key={selected.id}
          profile={selected}
          status={manager.rootStatus}
          remove={manager.removeRoot}
          simulateRestart={manager.simulateRootRestart}
          onClose={() => setRootRemovalOpened(false)}
        />
      )}
      {appLoading &&
        !dialog &&
        !signInDialog &&
        !localInstallOpened &&
        !rootSetupOpened &&
        !rootUpdateOpened &&
        !rootRemovalOpened && (
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
