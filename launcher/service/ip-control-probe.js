"use strict";

const https = require("https");
const openStore = require("./home-store");
const PORT_NAME = "AeroTizen.IpControlProbe";
const LAUNCHER_ID = "DclHome001.Home";

function isPort(value) {
  return Number.isInteger(value) && value > 0 && value <= 999;
}

function request(method, params, timeout) {
  return new Promise((resolve, reject) => {
    const packet = { jsonrpc: "2.0", id: 1, method };
    if (params) {
      packet.params = params;
    }
    const body = JSON.stringify(packet);
    const req = https.request(
      {
        hostname: "127.0.0.1",
        port: 1516,
        path: "/",
        method: "POST",
        // The TV uses a self-signed certificate. This request stays on the TV.
        rejectUnauthorized: false,
        agent: false,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          req.destroy();
          reject(new Error("HTTP error"));
          return;
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("error", reject);
        res.on("data", (chunk) => {
          data += chunk;
          if (data.length > 8192) {
            req.destroy();
            reject(new Error("Reply too large"));
          }
        });
        res.on("end", () => {
          try {
            const reply = JSON.parse(data);
            if (reply.id !== packet.id || reply.error || !("result" in reply)) {
              const error = new Error("RPC error");
              error.code = reply.error && reply.error.code;
              reject(error);
              return;
            }
            resolve(reply.result);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    const deadline = setTimeout(() => {
      req.destroy();
      reject(new Error("Request timed out"));
    }, timeout);
    req.on("close", () => {
      clearTimeout(deadline);
      reject(new Error("Connection closed"));
    });
    req.on("error", reject);
    req.end(body);
  });
}

function readState(store) {
  try {
    const state = JSON.parse(store.getValue());
    if (typeof state.token === "string" && state.token && Array.isArray(state.ports)) {
      return { token: state.token, ports: Array.from(new Set(state.ports.filter(isPort))) };
    }
  } catch (error) {
    // An absent or unreadable file can be replaced by a successful pairing.
  }
  return { token: "", ports: [] };
}

module.exports = function startIpControlProbe(tizen) {
  if (!tizen || !tizen.messageport) {
    return;
  }
  let store;
  let state = { token: "", ports: [] };
  const ready = new Promise((resolve) => {
    openStore(
      tizen,
      (storage) => {
        store = storage;
        if (storage) {
          state = readState(storage);
        }
        resolve();
      },
      "aerotizen-ip-control-v1.json",
    );
  });

  async function learn(nativePorts) {
    if (!store) {
      return { status: "storageFailed" };
    }
    let token = state.token;
    let active;
    if (token) {
      try {
        active = await request("getTVStates", { AccessToken: token }, 3000);
      } catch (error) {
        if (error.code !== -32010) {
          return { status: "readFailed" };
        }
        token = "";
      }
    }
    if (!token) {
      try {
        const pairing = await request("createAccessToken", null, 30000);
        token = pairing.AccessToken;
        if (typeof token !== "string" || !token.trim()) {
          return { status: "pairFailed" };
        }
      } catch (error) {
        return { status: "pairFailed" };
      }
      try {
        active = await request("getTVStates", { AccessToken: token }, 3000);
      } catch (error) {
        return { status: "readFailed" };
      }
    }
    if (!active || typeof active.inputSource !== "string" || !active.inputSource.trim()) {
      return { status: "readFailed" };
    }
    const match = /^HDMI\s*([1-9][0-9]{0,2})$/i.exec(active.inputSource.trim());
    const port = match ? Number(match[1]) : undefined;
    const known = port !== undefined && (nativePorts.indexOf(port) >= 0 || state.ports.indexOf(port) >= 0);
    const added = port !== undefined && !known;
    const ports = added ? state.ports.concat(port).sort((a, b) => a - b) : state.ports;
    if (added || token !== state.token) {
      const next = { token, ports };
      try {
        store.setValue(null, JSON.stringify(next));
      } catch (error) {
        return { status: "storageFailed" };
      }
      state = next;
    }
    if (added) {
      return { status: "added", port, ports };
    }
    return { status: known ? "known" : "noHdmi", port, ports };
  }

  async function switchInput(port) {
    if (state.ports.indexOf(port) < 0) {
      return { status: "switchFailed" };
    }
    try {
      await request("inputSourceControl", { AccessToken: state.token, inputSource: "HDMI" + port }, 3000);
      return { status: "switched" };
    } catch (error) {
      return { status: "switchFailed" };
    }
  }

  let running = false;
  const local = tizen.messageport.requestTrustedLocalMessagePort(PORT_NAME);
  local.addMessagePortListener(async (data, remote) => {
    const message = data[0];
    if (!remote || remote.appId !== LAUNCHER_ID || !message) {
      return;
    }
    try {
      const command = JSON.parse(message.value);
      await ready;
      let result = { status: "unavailable" };
      if (command.action === "list") {
        result = { status: "listed", ports: state.ports };
      } else if (!running) {
        running = true;
        try {
          if (command.action === "learn" && Array.isArray(command.nativePorts) && command.nativePorts.every(isPort)) {
            result = await learn(command.nativePorts);
          } else if (command.action === "switch" && isPort(command.port)) {
            result = await switchInput(command.port);
          }
        } finally {
          running = false;
        }
      }
      remote.sendMessage([{ key: message.key, value: JSON.stringify(result) }]);
    } catch (error) {
      // The launcher may have closed while the TV was displaying its prompt.
    }
  });
};
