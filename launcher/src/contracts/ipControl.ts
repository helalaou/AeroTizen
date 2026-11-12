export const IP_CONTROL_PORT_NAME = "AeroTizen.IpControlProbe";
export const IP_CONTROL_REPLY_PORT_NAME = "AeroTizen.IpControlProbeReply";
export const MAX_HDMI_PORT = 999;

export type LearnIpControlResult =
  | { readonly status: "added" | "known"; readonly port: number }
  | { readonly status: "noHdmi" | "pairFailed" | "readFailed" | "scanFailed" | "storageFailed" | "unavailable" };

export type IpControlCommand =
  | { readonly action: "list" }
  | { readonly action: "learn"; readonly nativePorts: readonly number[] }
  | { readonly action: "switch"; readonly port: number };

export interface IpControlPlatform {
  dispose(): void;
  request(command: IpControlCommand): Promise<unknown>;
}

export const isHdmiPort = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_HDMI_PORT;
