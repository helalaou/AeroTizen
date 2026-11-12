import * as https from "https";

import { IP_CONTROL_PORT_NAME, isHdmiPort } from "../contracts/ipControl";
import type { DiagnosticsStorageHost } from "../diagnostics/service/openDiagnosticsStore";

import type { HomePreference } from "./createHomeMode";
import openHomeStore from "./openHomeStore";
import { LAUNCHER_APP_ID, LOOPBACK_HOST } from "./protocol";

const IP_CONTROL_FILENAME = "aerotizen-ip-control-v1.json";
const IP_CONTROL_HTTPS_PORT = 1516;
const HTTP_OK = 200;
const MAX_RESPONSE_CHARACTERS = 8_192;
const PAIR_TIMEOUT_MS = 30_000;
const RPC_TIMEOUT_MS = 3_000;
const RPC_ID = 1;
const TOKEN_REVOKED = -32010;
const HDMI_SOURCE = /^HDMI\s*([1-9][0-9]{0,2})$/i;

interface MessageItem {
  readonly key: string;
  readonly value: string;
}
interface RemotePort {
  readonly appId: string;
  sendMessage(items: readonly MessageItem[]): void;
}
export interface IpControlServiceHost extends DiagnosticsStorageHost {
  messageport?: {
    requestTrustedLocalMessagePort(name: string): {
      addMessagePortListener(listener: (data: readonly MessageItem[], remote?: RemotePort) => void): number;
      removeMessagePortListener(id: number): void;
    };
  };
}
interface State {
  readonly ports: readonly number[];
  readonly token: string;
}
const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  value !== null && typeof value === "object" ? (value as Readonly<Record<string, unknown>>) : null;

const readState = (store: HomePreference): State => {
  try {
    const state = record(JSON.parse(store.getValue(IP_CONTROL_FILENAME)) as unknown);
    if (typeof state?.token === "string" && state.token.trim() && Array.isArray(state.ports)) {
      return { token: state.token, ports: Array.from(new Set(state.ports.filter(isHdmiPort))) };
    }
  } catch {
    // An absent or invalid file can be replaced after successful pairing.
  }
  return { token: "", ports: [] };
};

const startIpControl = (host: IpControlServiceHost | null): (() => void) => {
  const pending = new Set<() => void>();
  let disposed = false;
  const request = (
    method: string,
    params: Readonly<Record<string, unknown>> | null,
    timeoutMs: number,
  ): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (disposed) {
        reject(new Error("Service stopped"));
        return;
      }
      const packet = { jsonrpc: "2.0", id: RPC_ID, method, ...(params ? { params } : {}) };
      const body = JSON.stringify(packet);
      let active = true;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      let req: ReturnType<typeof https.request> | undefined;
      const finish = (error: Error | null, value?: unknown) => {
        if (!active) {
          return;
        }
        active = false;
        pending.delete(cancel);
        clearTimeout(deadline);
        if (error) {
          req?.destroy();
          reject(error);
        } else {
          resolve(value);
        }
      };
      const cancel = () => finish(new Error("Request cancelled"));
      pending.add(cancel);
      try {
        req = https.request(
          {
            hostname: LOOPBACK_HOST,
            port: IP_CONTROL_HTTPS_PORT,
            path: "/",
            method: "POST",
            // Samsung's self-signed certificate is used only on the TV loopback interface.
            rejectUnauthorized: false,
            agent: false,
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
            },
          },
          (res) => {
            if (res.statusCode !== HTTP_OK) {
              finish(new Error("HTTP error"));
              return;
            }
            let data = "";
            res.setEncoding("utf8");
            res.on("error", (error) => finish(error));
            res.on("data", (chunk: string) => {
              data += chunk;
              if (data.length > MAX_RESPONSE_CHARACTERS) {
                finish(new Error("Reply too large"));
              }
            });
            res.on("end", () => {
              if (!active) {
                return;
              }
              try {
                const reply = record(JSON.parse(data) as unknown);
                if (!reply || reply.id !== RPC_ID || reply.error || !("result" in reply)) {
                  finish(Object.assign(new Error("RPC error"), { code: record(reply?.error)?.code }));
                } else {
                  finish(null, reply.result);
                }
              } catch {
                finish(new Error("Invalid reply"));
              }
            });
          },
        );
        deadline = setTimeout(() => finish(new Error("Request timed out")), timeoutMs);
        req.on("close", () => finish(new Error("Connection closed")));
        req.on("error", (error) => finish(error));
        req.end(body);
      } catch {
        finish(new Error("Request failed"));
      }
    });
  if (!host?.messageport) {
    return () => {};
  }
  let store: HomePreference | null = null;
  let state: State = { token: "", ports: [] };
  const ready = new Promise<void>((resolve) => {
    openHomeStore(
      host,
      (storage) => {
        if (!disposed) {
          store = storage;
          if (storage) {
            state = readState(storage);
          }
        }
        resolve();
      },
      IP_CONTROL_FILENAME,
    );
  });
  const learn = async (nativePorts: readonly number[]) => {
    if (!store) {
      return { status: "storageFailed" };
    }
    let token = state.token;
    let active: unknown;
    if (token) {
      try {
        active = await request("getTVStates", { AccessToken: token }, RPC_TIMEOUT_MS);
      } catch (error) {
        if (record(error)?.code !== TOKEN_REVOKED) {
          return { status: "readFailed" };
        }
        token = "";
      }
    }
    if (!token) {
      try {
        const pairing = record(await request("createAccessToken", null, PAIR_TIMEOUT_MS));
        if (typeof pairing?.AccessToken !== "string" || !pairing.AccessToken.trim()) {
          return { status: "pairFailed" };
        }
        token = pairing.AccessToken;
      } catch {
        return { status: "pairFailed" };
      }
      try {
        active = await request("getTVStates", { AccessToken: token }, RPC_TIMEOUT_MS);
      } catch {
        return { status: "readFailed" };
      }
    }
    const inputSource = record(active)?.inputSource;
    if (typeof inputSource !== "string" || !inputSource.trim() || disposed) {
      return { status: "readFailed" };
    }
    const match = HDMI_SOURCE.exec(inputSource.trim());
    const port = match ? Number(match[1]) : undefined;
    const known = port !== undefined && (nativePorts.includes(port) || state.ports.includes(port));
    const added = port !== undefined && !known;
    const ports = added ? [...state.ports, port].sort((a, b) => a - b) : state.ports;
    if (added || token !== state.token) {
      const next = { token, ports };
      try {
        store.setValue(IP_CONTROL_FILENAME, JSON.stringify(next));
      } catch {
        return { status: "storageFailed" };
      }
      state = next;
    }
    if (added) {
      return { status: "added", port, ports };
    }
    return { status: known ? "known" : "noHdmi", port, ports };
  };
  const switchInput = async (port: number) => {
    if (!state.ports.includes(port)) {
      return { status: "switchFailed" };
    }
    try {
      await request("inputSourceControl", { AccessToken: state.token, inputSource: "HDMI" + port }, RPC_TIMEOUT_MS);
      return { status: "switched" };
    } catch {
      return { status: "switchFailed" };
    }
  };
  let running = false;
  const local = host.messageport.requestTrustedLocalMessagePort(IP_CONTROL_PORT_NAME);
  const receive = async (data: readonly MessageItem[], remote?: RemotePort) => {
    const message = data[0];
    if (disposed || !remote || remote.appId !== LAUNCHER_APP_ID || !message) {
      return;
    }
    try {
      const command = record(JSON.parse(message.value) as unknown);
      await ready;
      if (disposed || !command) {
        return;
      }
      let result: object = { status: "unavailable" };
      if (command.action === "list") {
        result = { status: "listed", ports: state.ports };
      } else if (!running) {
        running = true;
        try {
          if (
            command.action === "learn" &&
            Array.isArray(command.nativePorts) &&
            command.nativePorts.every(isHdmiPort)
          ) {
            result = await learn(command.nativePorts);
          } else if (command.action === "switch" && isHdmiPort(command.port)) {
            result = await switchInput(command.port);
          }
        } finally {
          running = false;
        }
      }
      if (!disposed) {
        remote.sendMessage([{ key: message.key, value: JSON.stringify(result) }]);
      }
    } catch {
      // The launcher can close while Samsung displays its pairing prompt.
    }
  };
  const listener = local.addMessagePortListener((data, remote) => {
    void receive(data, remote);
  });
  return () => {
    disposed = true;
    Array.from(pending).forEach((cancel) => cancel());
    try {
      local.removeMessagePortListener(listener);
    } catch {
      // Other service resources must still be released after a port restart.
    }
  };
};

export default startIpControl;
