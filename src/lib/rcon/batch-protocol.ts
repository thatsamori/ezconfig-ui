import { unwrapCustomResult } from "./result-envelope";

/** Versioned protocol carried by Mordhau's native Custom broadcast channel. */
export const BATCH_PROTOCOL = "EZConfigBatch/1" as const;
export const BATCH_RESULT_PREFIX = "EZCONFIG_BATCH_RESULT ";
export const MAX_BATCH_COMMANDS = 2_048;

type FrameBase = { v: 1; request: string };
export type BatchFrame = FrameBase & (
  | { op: "begin"; commands: number }
  | { op: "command"; token: string; seq: number; command: string }
  | { op: "end"; token: string; seq: number }
  | { op: "abort"; token: string; reason: "client_abort" | "processing_unconfirmed" }
);
export type BatchState = "active" | "complete" | "failed" | "aborted" | "timed_out" | "rejected";
export interface BatchProcessingResult {
  protocol: typeof BATCH_PROTOCOL;
  request: string;
  op: BatchFrame["op"];
  token: string;
  seq: number;
  success: boolean;
  accepted: number;
  ignored: number;
  totalAccepted: number;
  totalIgnored: number;
  /** Successful data operations, including an accepted wipe; excludes markers. */
  processed: number;
  cleared: boolean;
  state: BatchState;
  reason: string;
  maxCommands?: number;
  idleTimeoutSeconds?: number;
}

export class BatchProtocolError extends Error {
  constructor(message: string) { super(message); this.name = "BatchProtocolError"; }
}

export function innerConfigCommand(command: string): string {
  if (!command.startsWith("string ezconfig ")) throw new BatchProtocolError("Only EZConfig configuration commands can be applied");
  const inner = command.slice("string ".length);
  if (/^ezconfig (?:batch|reload|version)(?:\s|$)/i.test(inner)) throw new BatchProtocolError("Nested batches, reload and version are not configuration values");
  return inner;
}

export function encodeBatchFrame(frame: BatchFrame): string {
  // Blueprint JSON numeric getters narrow to Float32 before validation. Carry
  // integer control metadata as canonical decimal strings so fractions or
  // tiny negatives cannot round into an admitted integer on the server.
  if (frame.v !== 1 || typeof frame.request !== "string" || !frame.request || frame.request.length > 64) throw new BatchProtocolError("Invalid batch frame identity");
  if (frame.op === "begin" && (!Number.isSafeInteger(frame.commands) || frame.commands < 0 || frame.commands > MAX_BATCH_COMMANDS)) throw new BatchProtocolError("Invalid announced command count");
  if ("seq" in frame && (!Number.isSafeInteger(frame.seq) || frame.seq < 1 || frame.seq > MAX_BATCH_COMMANDS + 1)) throw new BatchProtocolError("Invalid batch command sequence");
  return `string ezconfig batch ${JSON.stringify({ ...frame, v: "1", ...("commands" in frame ? { commands: String(frame.commands) } : {}), ...("seq" in frame ? { seq: String(frame.seq) } : {}) })}`;
}

const integer = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function parseBatchProcessingResult(payload: string): BatchProcessingResult | null {
  payload = unwrapCustomResult(payload);
  if (!payload.startsWith(BATCH_RESULT_PREFIX)) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(payload.slice(BATCH_RESULT_PREFIX.length)); }
  catch { throw new BatchProtocolError("Malformed server batch result"); }
  const r = parsed as Partial<BatchProcessingResult> | null;
  if (!r || typeof r !== "object" || r.protocol !== BATCH_PROTOCOL ||
    typeof r.request !== "string" || !r.request || typeof r.token !== "string" ||
    !["begin", "command", "end", "abort"].includes(r.op ?? "") ||
    !["active", "complete", "failed", "aborted", "timed_out", "rejected"].includes(r.state ?? "") ||
    typeof r.success !== "boolean" || typeof r.cleared !== "boolean" || typeof r.reason !== "string" ||
    ![r.seq, r.accepted, r.ignored, r.totalAccepted, r.totalIgnored, r.processed].every(integer) ||
    (r.seq as number) > MAX_BATCH_COMMANDS + 1 || (r.processed as number) > MAX_BATCH_COMMANDS ||
    (r.accepted as number) > (r.totalAccepted as number) || (r.ignored as number) > (r.totalIgnored as number) ||
    (!r.success && (r.accepted !== 0 || r.ignored !== 0)) ||
    (r.state === "complete" && !r.success) ||
    (r.state === "active" && !r.success) ||
    (r.success && !["active", "complete"].includes(r.state ?? "")) ||
    (r.op !== "command" && (r.accepted !== 0 || r.ignored !== 0)) ||
    (r.maxCommands !== undefined && (!integer(r.maxCommands) || r.maxCommands < 1 || r.maxCommands > MAX_BATCH_COMMANDS)) ||
    (r.idleTimeoutSeconds !== undefined && (!Number.isFinite(r.idleTimeoutSeconds) || r.idleTimeoutSeconds <= 0 || r.idleTimeoutSeconds > 600))) {
    throw new BatchProtocolError("Incompatible server batch result");
  }
  return r as BatchProcessingResult;
}

export function matchesBatchResult(frame: BatchFrame, result: BatchProcessingResult): boolean {
  return result.request === frame.request && result.op === frame.op &&
    result.seq === ("seq" in frame ? frame.seq : 0) &&
    (frame.op === "begin" || result.token === frame.token);
}
