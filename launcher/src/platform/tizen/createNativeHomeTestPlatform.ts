import type { NativeHomeReport, NativeHomeTestPlatform } from "../../contracts/nativeHomeTest";

import type { LauncherRuntime } from "./launcherRuntime";

export const createNativeHomeTestPlatform = (runtime: LauncherRuntime): NativeHomeTestPlatform => ({
  startService: () =>
    new Promise<void>((resolve, reject) => {
      if (!runtime.homewatch.ensureService) {
        reject(new Error("tv_required"));
        return;
      }
      runtime.homewatch.ensureService(resolve, (reason) => reject(new Error(reason)));
    }),
  request: (method, action = "get") =>
    new Promise<NativeHomeReport>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open(method, "http://127.0.0.1:47790/diagnostics/native-home" + (action === "set" ? "/set" : ""));
      request.timeout = 2000;
      request.setRequestHeader("X-AeroTizen-Home-Probe", "diagnostic-v2");
      request.onerror = request.ontimeout = () => reject(new Error("service_unavailable"));
      request.onload = () => {
        try {
          const value = JSON.parse(request.responseText) as NativeHomeReport;
          if (request.status < 200 || request.status >= 300 || !value || typeof value.status !== "string") {
            reject(new Error("invalid_report"));
            return;
          }
          resolve(value);
        } catch {
          reject(new Error("invalid_report"));
        }
      };
      request.send();
    }),
});
