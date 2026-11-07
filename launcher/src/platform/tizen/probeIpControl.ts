import type { LauncherRuntime } from "./launcherRuntime";

interface MessageItem {
  key: string;
  value: string;
}

interface LocalPort {
  addMessagePortListener(receive: (items: MessageItem[]) => void): number;
  removeMessagePortListener(id: number): void;
}

interface MessagePorts {
  requestTrustedLocalMessagePort(name: string): LocalPort;
  requestTrustedRemoteMessagePort(
    appId: string,
    name: string,
  ): { sendMessage(items: MessageItem[], replyPort: LocalPort): void };
}

type Command = { action: "list" } | { action: "learn"; nativePorts: number[] } | { action: "switch"; port: number };
interface Reply {
  port?: unknown;
  ports?: unknown;
  status?: unknown;
}

export type LearnIpControlResult =
  | { status: "added" | "known"; port: number }
  | { status: "noHdmi" | "pairFailed" | "readFailed" | "scanFailed" | "storageFailed" | "unavailable" };

const messagePorts = () => (window as Window & { tizen?: { messageport?: MessagePorts } }).tizen?.messageport;
const isPort = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 999;

const request = (serviceId: string, command: Command, timeoutMs: number): Promise<Reply | null> => {
  const ports = messagePorts();
  if (!ports) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let local: LocalPort | undefined;
    let listener: number | undefined;
    const id = Date.now() + "-" + Math.random();
    const finish = (result: Reply | null) => {
      window.clearTimeout(timeout);
      try {
        if (listener !== undefined) {
          local?.removeMessagePortListener(listener);
        }
      } catch {
        // A service or app restart can invalidate the port before cleanup.
      }
      resolve(result);
    };
    const timeout = window.setTimeout(() => finish(null), timeoutMs);
    try {
      const remote = ports.requestTrustedRemoteMessagePort(serviceId, "AeroTizen.IpControlProbe");
      local = ports.requestTrustedLocalMessagePort("AeroTizen.IpControlProbeReply");
      listener = local.addMessagePortListener((items) => {
        const reply = items.find((item) => item.key === id);
        if (!reply) {
          return;
        }
        try {
          finish(JSON.parse(reply.value) as Reply | null);
        } catch {
          finish(null);
        }
      });
      remote.sendMessage([{ key: id, value: JSON.stringify(command) }], local);
    } catch {
      finish(null);
    }
  });
};
export const mountIpControlInputs = (runtime: LauncherRuntime) => {
  const ports = messagePorts();
  if (
    typeof ports?.requestTrustedLocalMessagePort !== "function" ||
    typeof ports.requestTrustedRemoteMessagePort !== "function"
  ) {
    return;
  }
  const { inputs, config, homewatch } = runtime;
  let disposed = false;
  let revision = 0;
  let retry: number | undefined;
  const call = (command: Command, timeoutMs: number) => request(config.SERVICE_ID, command, timeoutMs);
  const open = (port: number) => {
    if (disposed) {
      return;
    }
    if (
      !homewatch.openNativeHdmi?.(async () => (await call({ action: "switch", port }, 5000))?.status === "switched")
    ) {
      runtime.toast(runtime.translate("inputs.switchFailed"));
    }
  };
  const apply = (ports: unknown) => {
    if (!disposed && Array.isArray(ports)) {
      inputs.setIpControlPorts(ports.filter(isPort), open);
    }
  };
  const restore = async (attempts: number) => {
    if (disposed) {
      return;
    }
    const current = revision;
    const reply = await call({ action: "list" }, 3000);
    if (disposed || current !== revision) {
      return;
    }
    if (reply?.status === "listed") {
      apply(reply.ports);
    } else if (attempts > 1) {
      retry = window.setTimeout(() => void restore(attempts - 1), 1000);
    }
  };
  inputs.learnIpControl = async () => {
    if (!inputs.sourcesReady) {
      return { status: "scanFailed" };
    }
    const nativePorts = inputs.sources
      .filter((source) => source.type === "HDMI" && !source.ipControl)
      .map((source) => Number(source.number))
      .filter(isPort);
    const reply = await call({ action: "learn", nativePorts }, 40000);
    const status = reply?.status;
    if (status === "added" || status === "known" || status === "noHdmi") {
      revision += 1;
      apply(reply?.ports);
      if (status === "noHdmi") {
        return { status };
      }
      if (isPort(reply?.port)) {
        return { status, port: reply.port };
      }
    }
    if (status === "pairFailed" || status === "readFailed" || status === "storageFailed") {
      return { status };
    }
    return { status: "unavailable" };
  };
  void restore(4);
  return () => {
    disposed = true;
    window.clearTimeout(retry);
    delete inputs.learnIpControl;
  };
};
