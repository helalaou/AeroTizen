import type { DesktopService } from "../contracts";
import type { DesktopLog, LOG_ACTIONS } from "./desktopLogs";

type LogAction = keyof typeof LOG_ACTIONS;

export function loggedService(service: DesktopService, log: DesktopLog): DesktopService {
  function track<Args extends unknown[], Result>(action: LogAction, call: (...args: Args) => Promise<Result>) {
    return (...args: Args) => log.track(action, () => call(...args));
  }

  function read<Result>(action: LogAction, call: (id: string, signal: AbortSignal) => Promise<Result>) {
    return (id: string, signal: AbortSignal) => log.track(action, () => call(id, signal), { signal });
  }

  const { rootAccess, localApps, buttonActions, samsung } = service;
  const removeRoot = rootAccess?.remove;
  return {
    status: track("backend", service.status),
    list: track("savedTvs", service.list),
    discover: track("discovery", service.discover),
    connect: track("connect", service.connect),
    rename: track("rename", service.rename),
    forget: track("forget", service.forget),
    launcherCatalog: track("releases", service.launcherCatalog),
    installLauncher: track("launcherInstall", service.installLauncher),
    listApps: read("apps", service.listApps),
    removeApps: (id, packages) =>
      log.track("appsRemove", () => service.removeApps(id, packages), {
        outcome: ({ results }) =>
          results.length === packages.length && results.every(({ status }) => status === "removed")
            ? "completed"
            : "partial",
      }),
    listButtons: read("buttons", service.listButtons),
    readHomeBackup: service.readHomeBackup && track("homeBackupRead", service.readHomeBackup),
    prepareNativeHome: track("homeBackupSave", service.prepareNativeHome),
    applyNativeHome: service.applyNativeHome && track("homeApply", service.applyNativeHome),
    restoreHomeBackup: service.restoreHomeBackup && track("homeRestore", service.restoreHomeBackup),
    buttonActions: buttonActions && {
      listApps: read("buttonApps", buttonActions.listApps),
      change: track("buttonChange", buttonActions.change),
      updateInventory: track("buttonInventory", buttonActions.updateInventory),
    },
    localApps: localApps && {
      choose: (id) =>
        log.track("localAppChoose", () => localApps.choose(id), {
          outcome: (selection) => (selection ? "completed" : "cancelled"),
        }),
      install: track("localAppInstall", localApps.install),
    },
    rootAccess: rootAccess && {
      status: read("rootStatus", rootAccess.status),
      setup: (id, action) =>
        log.track(action === "verify" ? "rootVerify" : "rootSetup", () => rootAccess.setup(id, action), {
          outcome: ({ setup_complete }) => (setup_complete ? "completed" : "pending"),
        }),
      upgrade: (id, action) =>
        log.track("rootUpdate", () => rootAccess.upgrade(id, action), {
          outcome: ({ update_pending, setup_complete }) =>
            !update_pending && setup_complete ? "completed" : "pending",
        }),
      remove:
        removeRoot &&
        ((id, action) =>
          log.track("rootRemove", () => removeRoot(id, action), {
            outcome: ({ phase }) => (phase === "removed" ? "completed" : "pending"),
          })),
      revealRecovery: rootAccess.revealRecovery && track("rootRecovery", rootAccess.revealRecovery),
      simulateRestart: rootAccess.simulateRestart && track("simulatorRestart", rootAccess.simulateRestart),
    },
    samsung: samsung && {
      account: track("samsungAccount", samsung.account),
      signIn: (signal) => log.track("samsungSignIn", () => samsung.signIn(signal), { signal }),
      signOut: track("samsungSignOut", samsung.signOut),
      prepareCertificates: track("certificates", samsung.prepareCertificates),
    },
  };
}
