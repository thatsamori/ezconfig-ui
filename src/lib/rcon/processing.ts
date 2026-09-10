import { Socket } from "node:net";
import type { Rcon } from "rcon-client";
import { unwrapCustomResult } from "./result-envelope";
import { encodeBatchFrame, matchesBatchResult, parseBatchProcessingResult, type BatchFrame, type BatchProcessingResult } from "./batch-protocol";

export interface ServerProcessingResult {
  protocol: "EZConfig/1";
  command: string;
  success: boolean;
  accepted: number;
  ignored: number;
  error: string;
}

export class ProcessingResultError extends Error {
  constructor(
    message: string,
    public readonly kind: "capability" | "protocol" | "rejected" | "missing" | "transport" | "busy" | "aborted",
    public readonly result?: ServerProcessingResult,
  ) {
    super(message);
    this.name = "ProcessingResultError";
  }
}

/** Generic RCON delivery text is deliberately not a processing result. */
export function parseProcessingResult(payload: string): ServerProcessingResult | null {
  payload = unwrapCustomResult(payload);
  const prefix = "EZCONFIG_RESULT ";
  if (!payload.startsWith(prefix)) return null;
  let value: unknown;
  try {
    value = JSON.parse(payload.slice(prefix.length));
  } catch {
    throw new ProcessingResultError("Malformed server processing result", "protocol");
  }
  const r = value as Partial<ServerProcessingResult> | null;
  if (
    !r || typeof r !== "object" || r.protocol !== "EZConfig/1" ||
    typeof r.command !== "string" || typeof r.success !== "boolean" ||
    typeof r.error !== "string" ||
    !Number.isSafeInteger(r.accepted) || (r.accepted as number) < 0 ||
    !Number.isSafeInteger(r.ignored) || (r.ignored as number) < 0 ||
    (!r.success && (r.accepted !== 0 || r.ignored !== 0))
  ) {
    throw new ProcessingResultError("Incompatible server processing result", "protocol");
  }
  return r as ServerProcessingResult;
}

/**
 * rcon-client 4.2.5 exposes no unsolicited-packet event and discards unmatched
 * request IDs. Observe its socket without replacing its authentication, send
 * queue, packet handler, or generic command API. Fail closed if that narrow
 * version-specific seam changes. Native Custom-channel packets were captured
 * from the official dedicated server with the cooked mod on 2026-09-09.
 */
function connectedSocket(client: Rcon): Socket {
  const socket = (client as unknown as { socket?: unknown }).socket;
  if (!(socket instanceof Socket) || socket.destroyed) {
    throw new ProcessingResultError("RCON processing-result observation is unavailable", "capability");
  }
  return socket;
}

type Waiter = {
  command: string;
  batch?: BatchFrame;
  signal?: AbortSignal;
  onAbort?: () => void;
  resolve: (result: ServerProcessingResult | BatchProcessingResult) => void;
  reject: (error: ProcessingResultError) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** One decoder for the whole connection, including time between commands. */
class ProcessingReceiver {
  private bytes = Buffer.alloc(0);
  private waiter?: Waiter;
  private uncertain = false;
  private closed = false;
  private readonly socket: Socket;
  private readonly payloadObservers = new Set<(payload: string) => void>();

  observePayloads(observer: (payload: string) => void): () => void {
    this.payloadObservers.add(observer);
    return () => this.payloadObservers.delete(observer);
  }

  constructor(private readonly client: Rcon) {
    this.socket = connectedSocket(client);
    this.socket.on("data", this.onData);
    // rcon-client forwards socket errors to its public EventEmitter before a
    // later socket listener can run. Handle that public event to avoid throws.
    client.on("error", this.onError);
    client.on("end", this.onEnd);
  }

  private settle(error?: ProcessingResultError, result?: ServerProcessingResult | BatchProcessingResult) {
    const waiter = this.waiter;
    if (!waiter) return;
    this.waiter = undefined;
    clearTimeout(waiter.timer);
    if (waiter.signal && waiter.onAbort) waiter.signal.removeEventListener("abort", waiter.onAbort);
    if (error) {
      // Tagged batch requests may safely abort on the same healthy stream
      // after a missing/cancelled result. A late reply cannot match its new ID.
      if (error.kind !== "rejected" && !(waiter.batch && ["missing", "aborted"].includes(error.kind))) this.uncertain = true;
      waiter.reject(error);
    } else if (result) waiter.resolve(result);
  }

  private readonly onError = () => {
    this.uncertain = true;
    this.settle(new ProcessingResultError("Connection failed before server processing was confirmed", "transport"));
  };

  private readonly onEnd = () => {
    this.closed = true;
    this.settle(new ProcessingResultError("Connection closed before server processing was confirmed", "transport"));
    this.socket.off("data", this.onData);
    this.client.off("error", this.onError);
    this.client.off("end", this.onEnd);
    this.bytes = Buffer.alloc(0);
    this.payloadObservers.clear();
  };

  private protocolFailure(error: ProcessingResultError): void {
    this.uncertain = true;
    this.settle(error);
    // A persistent request listener must reconnect instead of remaining alive
    // on a decoder that can never consume another frame safely.
    this.socket.destroy();
  }

  private readonly onData = (chunk: Buffer) => {
    if (this.closed || this.uncertain) return;
    this.bytes = Buffer.concat([this.bytes, chunk]);
    while (this.bytes.length >= 4) {
      const length = this.bytes.readInt32LE(0);
      if (length < 10 || length > 1_048_576) {
        this.protocolFailure(new ProcessingResultError("Invalid RCON result packet length", "protocol"));
        return;
      }
      if (this.bytes.length < length + 4) return;
      const packet = this.bytes.subarray(4, length + 4);
      this.bytes = this.bytes.subarray(length + 4);
      if (packet[packet.length - 1] !== 0 || packet[packet.length - 2] !== 0) {
        this.protocolFailure(new ProcessingResultError("Invalid RCON result packet terminator", "protocol"));
        return;
      }
      let result: ServerProcessingResult | BatchProcessingResult | null;
      try {
        const text = packet.subarray(8, -2).toString("utf8");
        for (const observer of this.payloadObservers) observer(text);
        result = parseProcessingResult(text) ?? parseBatchProcessingResult(text);
      }
      catch (error) {
        this.protocolFailure(error instanceof ProcessingResultError ? error : new ProcessingResultError(error instanceof Error ? error.message : "Malformed result", "protocol"));
        return;
      }
      if (!result || !this.waiter) continue;
      if (result.protocol === "EZConfigBatch/1") {
        if (this.waiter.batch && matchesBatchResult(this.waiter.batch, result)) this.settle(undefined, result);
        continue;
      }
      if (this.waiter.batch || result.command !== this.waiter.command) continue;
      if (!result.success) {
        this.settle(new ProcessingResultError(result.error || "Server rejected the command", "rejected", result));
      } else this.settle(undefined, result);
      // Keep decoding every trailing frame/partial frame after completion.
    }
  };

  send(command: string, timeoutMs: number): Promise<ServerProcessingResult> {
    return this.waitFor(command, timeoutMs) as Promise<ServerProcessingResult>;
  }

  sendBatch(frame: BatchFrame, timeoutMs: number, signal?: AbortSignal): Promise<BatchProcessingResult> {
    return this.waitFor(encodeBatchFrame(frame), timeoutMs, frame, signal) as Promise<BatchProcessingResult>;
  }

  private waitFor(command: string, timeoutMs: number, batch?: BatchFrame, signal?: AbortSignal): Promise<ServerProcessingResult | BatchProcessingResult> {
    if (this.waiter) return Promise.reject(new ProcessingResultError("A command is already awaiting its server result", "busy"));
    if (this.closed || this.uncertain) return Promise.reject(new ProcessingResultError("Open a new connection after an uncertain result; do not replay automatically", "capability"));
    if (signal?.aborted) return Promise.reject(new ProcessingResultError("Apply was cancelled", "aborted"));
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        command: command.slice("string ".length), resolve, reject, batch, signal,
        timer: setTimeout(() => {
          if (this.waiter === waiter) this.settle(new ProcessingResultError("Server processing was not confirmed; the command may have run", "missing"));
        }, timeoutMs),
      };
      this.waiter = waiter;
      waiter.onAbort = () => {
        if (this.waiter === waiter) this.settle(new ProcessingResultError("Apply was cancelled; server processing may already have occurred", "aborted"));
      };
      signal?.addEventListener("abort", waiter.onAbort, { once: true });
      // A confirmed processing result outranks missing generic output. Consume
      // send errors, but never apply an old send error to a newer waiter.
      void this.client.send(command).catch(() => {
        if (this.waiter === waiter) this.onError();
      });
    });
  }
}

const receivers = new WeakMap<Rcon, ProcessingReceiver>();

/**
 * Call immediately after authentication, BEFORE subscribing to Custom broadcasts.
 * Stream framing must exist before any broadcast can start. Its buffer/listeners
 * live until connection end, while per-command waiters/timers are short-lived.
 */
export function prepareProcessingResultReceiver(client: Rcon): void {
  if (!receivers.has(client)) receivers.set(client, new ProcessingReceiver(client));
}

/** Observe validated native frame bodies on a prepared connection. */
export function observeRconPayloads(client: Rcon, observer: (payload: string) => void): () => void {
  const receiver = receivers.get(client);
  if (!receiver) throw new ProcessingResultError("Prepare the receiver before observing broadcasts", "capability");
  return receiver.observePayloads(observer);
}

/**
 * Opt-in for a prepared, authenticated, Custom-subscribed session. The caller
 * must establish compatible server capability before any destructive command.
 * Missing/transport outcomes are uncertain; never automatically replay them.
 * Explicit batch IDs/sequence correlation belong to the batch protocol.
 */
export function sendWithProcessingResult(
  client: Rcon,
  command: string,
  { timeoutMs = 5_000 }: { timeoutMs?: number } = {},
): Promise<ServerProcessingResult> {
  if (!command.startsWith("string ezconfig ")) return Promise.reject(new ProcessingResultError("Expected an EZConfig string command", "protocol"));
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.reject(new ProcessingResultError("Invalid processing-result timeout", "protocol"));
  const receiver = receivers.get(client);
  if (!receiver) return Promise.reject(new ProcessingResultError("Prepare the result receiver before subscribing to broadcasts", "capability"));
  return receiver.send(command, timeoutMs);
}

/** Correlated batch results carried by the native Custom broadcast channel. */
export function sendBatchFrameWithProcessingResult(
  client: Rcon,
  frame: BatchFrame,
  { timeoutMs = 5_000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<BatchProcessingResult> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.reject(new ProcessingResultError("Invalid processing-result timeout", "protocol"));
  const receiver = receivers.get(client);
  if (!receiver) return Promise.reject(new ProcessingResultError("Prepare the result receiver before subscribing to broadcasts", "capability"));
  try { return receiver.sendBatch(frame, timeoutMs, signal); }
  catch (error) { return Promise.reject(new ProcessingResultError(error instanceof Error ? error.message : "Invalid batch frame", "protocol")); }
}
