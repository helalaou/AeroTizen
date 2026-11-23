import type { IpControlCommand, IpControlPlatform } from "../../contracts/ipControl";
import { IP_CONTROL_PORT_NAME, IP_CONTROL_REPLY_PORT_NAME } from "../../contracts/ipControl";

const REQUEST_TIMEOUT_MS = { list: 3_000, learn: 40_000, switch: 5_000 } as const;
const STARTUP_TIMEOUT_MS = 30_000;

interface MessageItem {
  readonly key: string;
  readonly value: string;
}
interface LocalPort {
  addMessagePortListener(receive: (items: readonly MessageItem[]) => void): number;
  removeMessagePortListener(id: number): void;
}
export interface IpControlTizen {
  messageport?: {
    requestTrustedLocalMessagePort(name: string): LocalPort;
    requestTrustedRemoteMessagePort(
      appId: string,
      name: string,
    ): { sendMessage(items: readonly MessageItem[], replyPort: LocalPort): void };
  };
}
interface Host {
  AeroTizen: {
    config: { SERVICE_ID: string };
    homewatch: { start?(ready: () => void, failed: () => void): void };
    tizen?: IpControlTizen | null;
  };
  clearTimeout(id: number): void;
  diagnostic?(event: string, data: unknown): void;
  setTimeout(callback: () => void, timeoutMs: number): number;
}

export const createIpControlPlatform = (host: Host): IpControlPlatform | undefined => {
  const runtime = host.AeroTizen;
  const ports = runtime.tizen?.messageport;
  if (
    typeof ports?.requestTrustedLocalMessagePort !== "function" ||
    typeof ports.requestTrustedRemoteMessagePort !== "function"
  ) {
    return;
  }
  let disposed = false;
  let sequence = 0;
  const pending = new Set<() => void>();
  return {
    request(command: IpControlCommand) {
      if (disposed) {
        return Promise.resolve(null);
      }
      return new Promise((resolve) => {
        let active = true;
        let local: LocalPort | undefined;
        let listener: number | undefined;
        let timeout: number | undefined;
        const id = Date.now() + "-" + ++sequence;
        const finish = (value: unknown) => {
          if (!active) {
            return;
          }
          active = false;
          pending.delete(cancel);
          if (timeout !== undefined) {
            host.clearTimeout(timeout);
          }
          try {
            if (listener !== undefined) {
              local?.removeMessagePortListener(listener);
            }
          } catch {
            // A service restart can invalidate the message port.
          }
          resolve(value);
        };
        const cancel = () => finish(null);
        const fail = (reason: string, error?: unknown) => {
          if (!active) {
            return;
          }
          finish(null);
          const name = error && typeof error === "object" && "name" in error ? error.name : undefined;
          host.diagnostic?.("ip_control.message_failed", { action: command.action, reason, error: name });
        };
        pending.add(cancel);
        timeout = host.setTimeout(() => fail("service_start_timeout"), STARTUP_TIMEOUT_MS);
        const send = () => {
          if (!active || disposed) {
            return;
          }
          host.clearTimeout(timeout!);
          timeout = host.setTimeout(() => fail("message_reply_timeout"), REQUEST_TIMEOUT_MS[command.action]);
          let reason = "message_remote_port_failed";
          try {
            const remote = ports.requestTrustedRemoteMessagePort(runtime.config.SERVICE_ID, IP_CONTROL_PORT_NAME);
            reason = "message_port_registration_failed";
            local = ports.requestTrustedLocalMessagePort(IP_CONTROL_REPLY_PORT_NAME);
            listener = local.addMessagePortListener((items) => {
              const reply = items.find((item) => item.key === id);
              if (reply) {
                try {
                  finish(JSON.parse(reply.value) as unknown);
                } catch (error) {
                  fail("message_reply_invalid", error);
                }
              }
            });
            reason = "message_request_send_failed";
            remote.sendMessage([{ key: id, value: JSON.stringify(command) }], local);
          } catch (error) {
            fail(reason, error);
          }
        };
        try {
          if (runtime.homewatch.start) {
            runtime.homewatch.start(send, () => fail("service_start_rejected"));
          } else {
            send();
          }
        } catch (error) {
          fail("service_start_rejected", error);
        }
      });
    },
    dispose() {
      disposed = true;
      [...pending].forEach((cancel) => cancel());
    },
  };
};
