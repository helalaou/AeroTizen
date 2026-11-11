import type { ClientRequest, IncomingMessage } from "http";
import type { Duplex } from "stream";

import { LOOPBACK_HOST, SAMSUNG_API_PORT } from "./protocol";

const MAX_MESSAGE_BYTES = 131072;
const HISTORY_LIMIT = 64;
const RECONNECT_DELAY_MS = 4000;
const REPLY_TIMEOUT_MS = 2000;
const POLL_INTERVAL_MS = 3000;
const FRESH_TIMEOUT_MS = 2500;
const WEBSOCKET_MASK_BYTES = 4;
const REQUEST_NONCE_BYTES = 4;
const HANDSHAKE_NONCE_BYTES = 16;
const WEBSOCKET_ACCEPT_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const WEBSOCKET_VERSION = "13";
const ART_CHANNEL_PATH = "/api/v2/channels/com.samsung.art-app?name=QWVyb1RpemVu";
const SWITCHING_PROTOCOLS_STATUS = 101;
const FIN_BIT = 0x80;
const MASK_BIT = 0x80;
const RESERVED_BITS = 0x70;
const OPCODE_BITS = 0x0f;
const LENGTH_BITS = 0x7f;
const SHORT_LENGTH_MARKER = 126;
const LONG_LENGTH_MARKER = 127;
const MAX_OUTBOUND_PAYLOAD_BYTES = 65535;
const MAX_CONTROL_PAYLOAD_BYTES = 125;
const BASE_HEADER_BYTES = 2;
const SHORT_LENGTH_BYTES = 2;
const LONG_LENGTH_BYTES = 8;
const UINT32_BYTES = 4;
const SHORT_HEADER_BYTES = BASE_HEADER_BYTES + SHORT_LENGTH_BYTES;
const LONG_HEADER_BYTES = BASE_HEADER_BYTES + LONG_LENGTH_BYTES;
const MAX_FRAME_HEADER_BYTES = LONG_HEADER_BYTES + WEBSOCKET_MASK_BYTES;
const OPCODES = { continuation: 0, text: 1, close: 8, ping: 9, pong: 10 } as const;

type ServiceTimer = ReturnType<typeof setTimeout>;
export type ArtModeStatus = "unknown" | "on" | "off";

interface ArtModeOptions {
  onChange?(value: ArtModeStatus, reason: string): void;
}

interface ArtSample {
  at: number;
  generation: number;
  reason: string;
  requestId: string | null;
  sentAt: number | null;
  value: ArtModeStatus;
}

interface ArtModeState {
  artMode: ArtModeStatus;
  events: { at: number; kind: string; detail: string | null }[];
  generation: number;
  latest: ArtSample | null;
  matchedReplies: number;
  phase: "not-started" | "starting" | "connecting" | "querying" | "retry-wait" | "unavailable" | "stopped";
  runtime: { http: boolean; crypto: boolean; buffer: boolean };
  samples: ArtSample[];
  sentQueries: number;
}

interface ArtWaiter {
  callback(value: ArtModeStatus): void;
  done: boolean;
  timer: ServiceTimer | undefined;
}

interface ArtQuery {
  id: string;
  sentAt: number;
  timer: ServiceTimer | undefined;
  waiters: ArtWaiter[];
}

interface ArtConnection {
  failed: boolean;
  fragments: Buffer[] | null;
  fragmentSize: number;
  input: Buffer;
  ready: boolean;
  request: ClientRequest | null;
  socket: Duplex | null;
  timer: ServiceTimer | undefined;
}

export interface ArtModeClient {
  fresh(callback: (value: ArtModeStatus) => void): void;
  getState(): ArtModeState;
  start(): void;
  stop(): void;
}

declare const require: {
  (name: "http"): typeof import("http");
  (name: "crypto"): typeof import("crypto");
};

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  value !== null && typeof value === "object" ? (value as Readonly<Record<string, unknown>>) : null;

// Read-only Samsung Art Mode client. An off cache is never a launch permit.
const createArtMode = (input: ArtModeOptions | null = {}): ArtModeClient => {
  const options = input || {};
  let http: typeof import("http") | null = null;
  let crypto: typeof import("crypto") | null = null;
  let running = false;
  let active: ArtConnection | null = null;
  let retryTimer: ServiceTimer | undefined;
  let queryTimer: ServiceTimer | undefined;
  let freshTimer: ServiceTimer | undefined;
  let pending: ArtQuery | null = null;
  let waiting: ArtWaiter[] = [];
  let sequence = 0;
  const state: ArtModeState = {
    phase: "not-started",
    artMode: "unknown",
    generation: 0,
    sentQueries: 0,
    matchedReplies: 0,
    latest: null,
    samples: [],
    events: [],
    runtime: { http: false, crypto: false, buffer: typeof Buffer !== "undefined" },
  };

  function now() {
    return Date.now();
  }
  function ring<T>(list: T[], item: T) {
    list.push(item);
    if (list.length > HISTORY_LIMIT) {
      list.shift();
    }
  }
  function event(kind: string, detail?: string) {
    ring(state.events, { at: now(), kind: kind, detail: detail || null });
  }
  function sample(value: ArtModeStatus, reason: string, id?: string | null, sentAt?: number | null) {
    const item = {
      at: now(),
      value: value,
      reason: reason,
      requestId: id || null,
      sentAt: sentAt || null,
      generation: state.generation,
    };
    state.artMode = value;
    state.latest = item;
    ring(state.samples, item);
    if (typeof options.onChange === "function") {
      try {
        options.onChange(value, reason);
      } catch (e) {
        event("callback-error", "status callback failed");
      }
    }
  }
  function bytes(value: string) {
    return new Buffer(value);
  }
  function allocate(length: number) {
    const out = new Buffer(length);
    out.fill(0);
    return out;
  }
  function finish(ownedWaiter: ArtWaiter, value: ArtModeStatus) {
    const waiter = ownedWaiter;
    if (waiter.done) {
      return;
    }
    waiter.done = true;
    clearTimeout(waiter.timer);
    try {
      waiter.callback(value);
    } catch (e) {
      event("callback-error", "fresh callback failed");
    }
  }
  function finishAll(waiters: readonly ArtWaiter[], value: ArtModeStatus) {
    for (let i = 0; i < waiters.length; i += 1) {
      finish(waiters[i], value);
    }
  }
  function invalidate(reason: string, value?: ArtModeStatus) {
    const old = pending;
    pending = null;
    if (old) {
      clearTimeout(old.timer);
    }
    const queued = waiting;
    waiting = [];
    clearTimeout(freshTimer);
    freshTimer = undefined;
    sample(value || "unknown", reason, old && old.id, old && old.sentAt);
    if (old) {
      finishAll(old.waiters, value || "unknown");
    }
    finishAll(queued, value || "unknown");
  }
  function clearTransportTimers() {
    clearTimeout(retryTimer);
    retryTimer = undefined;
    clearTimeout(queryTimer);
    queryTimer = undefined;
    clearTimeout(freshTimer);
    freshTimer = undefined;
  }
  function dispose(connection: ArtConnection | null) {
    const conn = connection;
    if (!conn) {
      return;
    }
    clearTimeout(conn.timer);
    conn.failed = true;
    if (conn.socket) {
      conn.socket.destroy();
    }
    if (conn.request) {
      if (typeof conn.request.destroy === "function") {
        conn.request.destroy();
      } else if (typeof conn.request.abort === "function") {
        conn.request.abort();
      }
    }
  }
  function lost(conn: ArtConnection, reason: string) {
    if (active !== conn || conn.failed) {
      return;
    }
    active = null;
    dispose(conn);
    clearTransportTimers();
    invalidate(reason);
    event("connection-lost", reason);
    if (running) {
      state.phase = "retry-wait";
      retryTimer = setTimeout(connect, RECONNECT_DELAY_MS);
    }
  }
  function sendFrame(conn: ArtConnection, opcode: number, payload: Buffer) {
    if (!running || active !== conn || conn.failed || !conn.socket) {
      return false;
    }
    try {
      if (payload.length > MAX_OUTBOUND_PAYLOAD_BYTES) {
        throw new Error("outbound frame too large");
      }
      const extra = payload.length < SHORT_LENGTH_MARKER ? 0 : SHORT_LENGTH_BYTES;
      const frame = allocate(BASE_HEADER_BYTES + extra + WEBSOCKET_MASK_BYTES + payload.length);
      frame[0] = FIN_BIT | opcode;
      frame[1] = MASK_BIT | (extra ? SHORT_LENGTH_MARKER : payload.length);
      if (extra) {
        frame.writeUInt16BE(payload.length, BASE_HEADER_BYTES);
      }
      const maskAt = BASE_HEADER_BYTES + extra;
      if (!crypto) {
        throw new Error("crypto module unavailable");
      }
      const mask = crypto.randomBytes(WEBSOCKET_MASK_BYTES);
      mask.copy(frame, maskAt);
      for (let i = 0; i < payload.length; i += 1) {
        frame[maskAt + WEBSOCKET_MASK_BYTES + i] = payload[i] ^ mask[i % WEBSOCKET_MASK_BYTES];
      }
      conn.socket.write(frame);
      return true;
    } catch (e) {
      lost(conn, "write failed");
      return false;
    }
  }
  function pumpFresh() {
    clearTimeout(freshTimer);
    freshTimer = undefined;
    if (!waiting.length || pending) {
      return;
    }
    if (!running || !active || !active.ready || active.failed) {
      const queued = waiting;
      waiting = [];
      finishAll(queued, "unknown");
      return;
    }
    const callers = waiting;
    waiting = [];
    requestArt(active, callers);
  }
  function queuePump() {
    if (!freshTimer && waiting.length) {
      freshTimer = setTimeout(pumpFresh, 0);
    }
  }
  function requestArt(conn: ArtConnection, waiters: ArtWaiter[] = []) {
    if (!running || active !== conn || !conn.ready || pending) {
      return;
    }
    let id;
    try {
      if (!crypto) {
        throw new Error("crypto module unavailable");
      }
      id = "aerotizen-" + now() + "-" + ++sequence + "-" + crypto.randomBytes(REQUEST_NONCE_BYTES).toString("hex");
    } catch (e) {
      finishAll(waiters || [], "unknown");
      lost(conn, "request ID failed");
      return;
    }
    const sentAt = now();
    const request = { request: "get_artmode_status", id: id, request_id: id };
    const message = {
      method: "ms.channel.emit",
      params: {
        event: "art_app_request",
        to: "broadcast",
        data: JSON.stringify(request),
      },
    };
    const current: ArtQuery = { id, sentAt, timer: undefined, waiters };
    pending = current;
    if (!sendFrame(conn, OPCODES.text, bytes(JSON.stringify(message)))) {
      return;
    }
    state.sentQueries += 1;
    event("query-sent", id);
    current.timer = setTimeout(function () {
      if (pending !== current) {
        return;
      }
      pending = null;
      sample("unknown", "reply-timeout", id, sentAt);
      finishAll(current.waiters, "unknown");
      queuePump();
    }, REPLY_TIMEOUT_MS);
  }
  function scheduleQuery(conn: ArtConnection) {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(function () {
      if (!running || active !== conn || conn.failed) {
        return;
      }
      if (waiting.length) {
        pumpFresh();
      } else {
        requestArt(conn);
      }
      scheduleQuery(conn);
    }, POLL_INTERVAL_MS);
  }
  function message(connection: ArtConnection, payload: Buffer) {
    const conn = connection;
    let msg: Readonly<Record<string, unknown>> | null;
    try {
      msg = record(JSON.parse(payload.toString("utf8")));
    } catch (e) {
      event("invalid-message", "JSON parse failed");
      return;
    }
    if (!msg || typeof msg !== "object") {
      return;
    }
    if (msg.event === "ms.channel.ready") {
      if (!conn.ready) {
        conn.ready = true;
        state.phase = "querying";
        clearTimeout(conn.timer);
        event("channel-ready");
        if (waiting.length) {
          pumpFresh();
        } else {
          requestArt(conn);
        }
        scheduleQuery(conn);
      }
      return;
    }
    if (msg.event === "go_to_standby") {
      invalidate("standby-event");
      return;
    }
    if (msg.event !== "d2d_service_message") {
      return;
    }
    let reply: Readonly<Record<string, unknown>> | null;
    try {
      reply = record(typeof msg.data === "string" ? JSON.parse(msg.data) : msg.data);
    } catch (e) {
      event("invalid-reply", "JSON parse failed");
      return;
    }
    if (!reply || typeof reply !== "object") {
      return;
    }
    const value = reply.value || reply.status;
    const statusEvent = reply.event === "get_artmode_status" || reply.event === "artmode_status";
    if (statusEvent && pending && (reply.request_id || reply.id) === pending.id) {
      if (value !== "on" && value !== "off") {
        invalidate("invalid-reply");
        return;
      }
      const current = pending;
      pending = null;
      clearTimeout(current.timer);
      state.matchedReplies += 1;
      sample(value, "matching-reply", current.id, current.sentAt);
      finishAll(current.waiters, running && active === conn ? value : "unknown");
      queuePump();
      return;
    }
    // Broadcast events can veto a launch, but only a correlated query can allow it.
    if (reply.event === "go_to_standby") {
      invalidate("standby-event");
    } else if ((statusEvent || reply.event === "artmode_changed") && value === "on") {
      invalidate("art-on-event", "on");
    }
  }
  function receive(connection: ArtConnection, chunk: Buffer) {
    const conn = connection;
    if (!running || active !== conn || conn.failed) {
      return;
    }
    if (conn.input.length + chunk.length > MAX_MESSAGE_BYTES + MAX_FRAME_HEADER_BYTES) {
      lost(conn, "input limit");
      return;
    }
    conn.input = Buffer.concat([conn.input, chunk]);
    while (conn.input.length >= BASE_HEADER_BYTES) {
      const input = conn.input;
      const fin = (input[0] & FIN_BIT) !== 0;
      const opcode = input[0] & OPCODE_BITS;
      let length = input[1] & LENGTH_BITS;
      let offset = BASE_HEADER_BYTES;
      if (input[0] & RESERVED_BITS || input[1] & MASK_BIT) {
        lost(conn, "invalid frame flags");
        return;
      }
      if (length === SHORT_LENGTH_MARKER) {
        if (input.length < SHORT_HEADER_BYTES) {
          return;
        }
        length = input.readUInt16BE(BASE_HEADER_BYTES);
        offset = SHORT_HEADER_BYTES;
      } else if (length === LONG_LENGTH_MARKER) {
        if (input.length < LONG_HEADER_BYTES) {
          return;
        }
        if (input.readUInt32BE(BASE_HEADER_BYTES) !== 0) {
          lost(conn, "frame limit");
          return;
        }
        length = input.readUInt32BE(BASE_HEADER_BYTES + UINT32_BYTES);
        offset = LONG_HEADER_BYTES;
      }
      if (length > MAX_MESSAGE_BYTES) {
        lost(conn, "frame limit");
        return;
      }
      if (opcode >= OPCODES.close && (!fin || length > MAX_CONTROL_PAYLOAD_BYTES)) {
        lost(conn, "invalid control frame");
        return;
      }
      if (input.length < offset + length) {
        return;
      }
      const payload = input.slice(offset, offset + length);
      conn.input = input.slice(offset + length);
      if (opcode === OPCODES.close) {
        lost(conn, "peer closed");
        return;
      }
      if (opcode === OPCODES.ping) {
        event("ping");
        if (!sendFrame(conn, OPCODES.pong, payload)) {
          return;
        }
      } else if (opcode === OPCODES.pong) {
        event("pong");
      } else if (opcode === OPCODES.text) {
        if (conn.fragments) {
          lost(conn, "overlapping text frames");
          return;
        }
        if (fin) {
          message(conn, payload);
        } else {
          conn.fragments = [payload];
          conn.fragmentSize = payload.length;
        }
      } else if (opcode === OPCODES.continuation) {
        if (!conn.fragments) {
          lost(conn, "unexpected continuation");
          return;
        }
        conn.fragmentSize += payload.length;
        if (conn.fragmentSize > MAX_MESSAGE_BYTES) {
          lost(conn, "message limit");
          return;
        }
        conn.fragments.push(payload);
        if (fin) {
          const full = Buffer.concat(conn.fragments, conn.fragmentSize);
          conn.fragments = null;
          conn.fragmentSize = 0;
          message(conn, full);
        }
      } else {
        lost(conn, "unsupported opcode");
        return;
      }
      if (active !== conn || conn.failed) {
        return;
      }
    }
  }
  function connect() {
    if (!running || active || !http || !crypto) {
      return;
    }
    state.phase = "connecting";
    state.generation += 1;
    const conn: ArtConnection = {
      failed: false,
      ready: false,
      socket: null,
      request: null,
      input: allocate(0),
      fragments: null,
      fragmentSize: 0,
      timer: undefined,
    };
    active = conn;
    try {
      const key = crypto.randomBytes(HANDSHAKE_NONCE_BYTES).toString("base64");
      const accept = crypto
        .createHash("sha1")
        .update(key + WEBSOCKET_ACCEPT_GUID)
        .digest("base64");
      conn.request = http.request({
        host: LOOPBACK_HOST,
        port: SAMSUNG_API_PORT,
        method: "GET",
        path: ART_CHANNEL_PATH,
        headers: {
          Connection: "Upgrade",
          Upgrade: "websocket",
          "Sec-WebSocket-Version": WEBSOCKET_VERSION,
          "Sec-WebSocket-Key": key,
        },
      });
      conn.request.on("upgrade", function (res: IncomingMessage, socket: Duplex, head: Buffer) {
        if (!running || active !== conn || conn.failed) {
          socket.destroy();
          return;
        }
        conn.socket = socket;
        if (
          res.statusCode !== SWITCHING_PROTOCOLS_STATUS ||
          String(res.headers.upgrade || "").toLowerCase() !== "websocket" ||
          !/(^|,)\s*upgrade\s*(,|$)/i.test(String(res.headers.connection || "")) ||
          res.headers["sec-websocket-accept"] !== accept
        ) {
          lost(conn, "invalid upgrade");
          return;
        }
        event("websocket-open");
        socket.on("data", function (chunk: Buffer) {
          receive(conn, chunk);
        });
        socket.on("error", function () {
          lost(conn, "socket error");
        });
        socket.on("end", function () {
          lost(conn, "socket ended");
        });
        socket.on("close", function () {
          lost(conn, "socket closed");
        });
        if (head && head.length) {
          receive(conn, head);
        }
      });
      conn.request.on("response", function (res: IncomingMessage) {
        if (typeof res.resume === "function") {
          res.resume();
        }
        lost(conn, "HTTP response without upgrade");
      });
      conn.request.on("error", function () {
        lost(conn, "request error");
      });
      conn.timer = setTimeout(function () {
        lost(conn, "channel timeout");
      }, REPLY_TIMEOUT_MS);
      conn.request.end();
    } catch (e) {
      lost(conn, "connect failed");
    }
  }
  function start() {
    if (running) {
      return;
    }
    running = true;
    state.phase = "starting";
    try {
      http = require("http");
      state.runtime.http = true;
    } catch (e) {
      event("runtime-error", "http module unavailable");
    }
    try {
      crypto = require("crypto");
      state.runtime.crypto = true;
    } catch (e) {
      event("runtime-error", "crypto module unavailable");
    }
    if (!http || !crypto || !state.runtime.buffer) {
      running = false;
      state.phase = "unavailable";
      invalidate("required runtime capability unavailable");
      return;
    }
    connect();
  }
  function stop() {
    running = false;
    state.phase = "stopped";
    clearTransportTimers();
    const conn = active;
    active = null;
    dispose(conn);
    invalidate("stopped");
  }
  function fresh(callback: (value: ArtModeStatus) => void) {
    if (typeof callback !== "function") {
      return;
    }
    if (!running || !active || !active.ready || active.failed) {
      try {
        callback("unknown");
      } catch (e) {
        event("callback-error", "fresh callback failed");
      }
      return;
    }
    const waiter: ArtWaiter = { callback, done: false, timer: undefined };
    waiter.timer = setTimeout(function () {
      if (!waiter.done) {
        invalidate("fresh-timeout");
      }
    }, FRESH_TIMEOUT_MS);
    waiting.push(waiter);
    queuePump();
  }
  return {
    start: start,
    stop: stop,
    fresh: fresh,
    getState: function (): ArtModeState {
      return JSON.parse(JSON.stringify(state)) as ArtModeState;
    },
  };
};

export default createArtMode;
