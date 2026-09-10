import { describe, expect, test } from "bun:test";
import { runAcknowledgedBatch, type BatchExchange } from "../src/lib/rcon/batch";
import { BATCH_PROTOCOL, BATCH_RESULT_PREFIX, encodeBatchFrame, parseBatchProcessingResult, type BatchFrame, type BatchProcessingResult } from "../src/lib/rcon/batch-protocol";
import { applyFeedback } from "../src/lib/rcon/apply-feedback";

const wipe = "string ezconfig WipeDatabases";
const values = 'string ezconfig Character Combat {"StaminaCostModifier":"1.2","MeleeWindupModifier":"0.8"}';
const next = 'string ezconfig ArmingSword Strike {"Damage":"1.00,2.00,3.00,4.00"}';
const options = () => { let i = 0; return { requestId: () => `request-${++i}` }; };
function reply(frame: BatchFrame, changes: Partial<BatchProcessingResult> = {}): BatchProcessingResult {
  return {
    protocol: BATCH_PROTOCOL, request: frame.request, op: frame.op,
    token: "token" in frame ? frame.token : "server-issued-token", seq: "seq" in frame ? frame.seq : 0,
    success: true, accepted: 0, ignored: 0, totalAccepted: 0, totalIgnored: 0, processed: 0,
    cleared: false, state: frame.op === "end" ? "complete" : "active", reason: "",
    ...(frame.op === "begin" ? { maxCommands: 2_048, idleTimeoutSeconds: 30 } : {}), ...changes,
  };
}

describe("acknowledged batch sender (controlled processing-result fixtures)", () => {
  test("admission precedes any mutation and framing preserves each inner payload", async () => {
    const frames: BatchFrame[] = [];
    let admit!: (result: BatchProcessingResult) => void;
    const exchange: BatchExchange = async (frame) => {
      frames.push(frame);
      if (frame.op === "begin") return new Promise((resolve) => { admit = resolve; });
      if (frame.op === "command" && frame.seq === 1) return reply(frame, { cleared: true, processed: 1 });
      if (frame.op === "command") return reply(frame, { accepted: 2, ignored: 1, totalAccepted: 2, totalIgnored: 1, processed: 2, cleared: true });
      return reply(frame, { totalAccepted: 2, totalIgnored: 1, processed: 2, cleared: true });
    };
    const commands = [wipe, values];
    const pending = runAcknowledgedBatch(commands, exchange, options());
    expect(frames.map((f) => f.op)).toEqual(["begin"]);
    commands[1] = "string ezconfig Character Combat {}"; // Snapshot already captured.
    admit(reply(frames[0]));
    const result = await pending;
    expect(result).toMatchObject({ success: true, commandsSent: 2, commandsSucceeded: 2, acceptedValues: 2, ignoredKeys: 1, configurationCleared: true });
    expect(frames.map((f) => f.op)).toEqual(["begin", "command", "command", "end"]);
    expect(frames[0]).toMatchObject({ commands: 2 });
    expect(frames[2]).toMatchObject({ command: values.slice(7), seq: 2 });
    const wire = encodeBatchFrame(frames[2]);
    expect(JSON.parse(wire.slice("string ezconfig batch ".length)).command).toBe(values.slice(7));
    expect(JSON.parse(wire.slice("string ezconfig batch ".length))).toMatchObject({ v: "1", seq: "2" });
    expect(new Set(frames.map((f) => f.request)).size).toBe(4);
  });
  test("unsupported or rejected admission sends no wipe", async () => {
    for (const missing of [false, true]) {
      const frames: BatchFrame[] = [];
      const result = await runAcknowledgedBatch([wipe, values], async (frame) => {
        frames.push(frame);
        if (missing) throw new Error("Server capability was not confirmed");
        return reply(frame, { success: false, state: "rejected", token: "", reason: "Another apply is active" });
      }, options());
      expect(result).toMatchObject({ success: false, status: "rejected", commandsSent: 0, acceptedValues: 0, configurationCleared: false });
      expect(frames.map((f) => f.op)).toEqual(["begin"]);
    }
  });
  test("wipe-only and empty no-wipe still require explicit successful end", async () => {
    for (const commands of [[], [wipe]]) {
      const frames: BatchFrame[] = [];
      const result = await runAcknowledgedBatch(commands, async (frame) => {
        frames.push(frame);
        return reply(frame, frame.op === "begin" ? {} : { processed: commands.length, cleared: commands.length === 1 });
      }, options());
      expect(result.success).toBe(true);
      expect(result.acceptedValues).toBe(0);
      expect(result.configurationCleared).toBe(commands.length === 1);
      expect(frames.at(-1)).toMatchObject({ op: "end", seq: commands.length + 1 });
    }
  });
  test("first rejected command stops after wipe and preserves the cleared state", async () => {
    const frames: BatchFrame[] = [];
    const result = await runAcknowledgedBatch([wipe, values, next], async (frame) => {
      frames.push(frame);
      if (frame.op === "begin") return reply(frame);
      if (frame.op === "command" && frame.seq === 1) return reply(frame, { processed: 1, cleared: true });
      return reply(frame, { success: false, state: "failed", reason: "Invalid numeric representation", processed: 1, cleared: true });
    }, options());
    expect(frames.map((f) => f.op)).toEqual(["begin", "command", "command"]);
    expect(result).toMatchObject({ success: false, status: "incomplete", commandsSent: 2, commandsSucceeded: 1, acceptedValues: 0, configurationCleared: true, failedAt: "command 2" });
  });
  test("failure after accepted values retains only successful command totals", async () => {
    const frames: BatchFrame[] = [];
    const result = await runAcknowledgedBatch([values, next, values], async (frame) => {
      frames.push(frame);
      if (frame.op === "begin") return reply(frame);
      if (frame.op === "command" && frame.seq === 1) return reply(frame, { accepted: 2, ignored: 1, totalAccepted: 2, totalIgnored: 1, processed: 1 });
      return reply(frame, { success: false, state: "failed", totalAccepted: 2, totalIgnored: 1, processed: 1, reason: "Rejected" });
    }, options());
    expect(result).toMatchObject({ success: false, acceptedValues: 2, ignoredKeys: 1, commandsSucceeded: 1 });
    expect(frames.filter((f) => f.op === "command")).toHaveLength(2);
  });
  test("lost outcome is never replayed and terminal abort may confirm more processing", async () => {
    const frames: BatchFrame[] = [];
    const result = await runAcknowledgedBatch([values, next], async (frame) => {
      frames.push(frame);
      if (frame.op === "begin") return reply(frame);
      if (frame.op === "command") throw new Error("Processing result missing");
      return reply(frame, { success: false, state: "aborted", processed: 1, totalAccepted: 2 });
    }, options());
    expect(frames.map((f) => f.op)).toEqual(["begin", "command", "abort"]);
    expect(result).toMatchObject({ success: false, status: "incomplete", commandsSent: 1, commandsSucceeded: 1, acceptedValues: 2 });
  });
  test("disconnect/missing abort leaves useful confirmed progress and no success", async () => {
    const frames: BatchFrame[] = [];
    const result = await runAcknowledgedBatch([values, next], async (frame) => {
      frames.push(frame);
      if (frame.op === "begin") return reply(frame);
      if (frame.op === "command" && frame.seq === 1) return reply(frame, { accepted: 2, totalAccepted: 2, processed: 1 });
      throw new Error("Connection closed");
    }, options());
    expect(result).toMatchObject({ success: false, status: "unconfirmed", commandsSent: 2, commandsSucceeded: 1, acceptedValues: 2 });
    expect(frames.map((f) => f.op)).toEqual(["begin", "command", "command", "abort"]);
  });
  test("late successful terminal information cannot turn an interrupted attempt into success", async () => {
    const frames: BatchFrame[] = [];
    const result = await runAcknowledgedBatch([values], async (frame) => {
      frames.push(frame);
      if (frame.op === "begin") return reply(frame);
      if (frame.op === "command") return reply(frame, { accepted: 2, totalAccepted: 2, processed: 1 });
      if (frame.op === "end") throw new Error("Completion result missing");
      return reply(frame, { state: "complete", totalAccepted: 2, processed: 1 });
    }, options());
    expect(result).toMatchObject({ success: false, status: "unconfirmed", serverState: "complete", acceptedValues: 2 });
    expect(applyFeedback(result, "fixture server")).toContain("Server reported completion after confirmation was interrupted");
    expect(frames.map((f) => f.op)).toEqual(["begin", "command", "end", "abort"]);
  });
  test("cancelled admission cleanup does not reuse the cancelled signal or send data", async () => {
    const controller = new AbortController(); const frames: BatchFrame[] = [];
    const result = await runAcknowledgedBatch([wipe], async (frame, opts) => {
      frames.push(frame);
      if (frame.op === "begin") { controller.abort(); return reply(frame); }
      expect(opts?.signal).toBeUndefined();
      return reply(frame, { success: false, state: "aborted" });
    }, { ...options(), signal: controller.signal });
    expect(result).toMatchObject({ success: false, commandsSent: 0, configurationCleared: false });
    expect(frames.map((f) => f.op)).toEqual(["begin", "abort"]);
  });
  test("invalid local commands never ask for admission", async () => {
    let called = false;
    for (const command of ["quit", "string ezconfig reload", "string ezconfig batch {}", "string ezconfig version"]) {
      const result = await runAcknowledgedBatch([command], async (f) => { called = true; return reply(f); }, options());
      expect(result.success).toBe(false); expect(result.failedAt).toBe("validation");
    }
    expect(called).toBe(false);
  });
  test("codec rejects malformed totals and preserves compact correlation fields", () => {
    const frame: BatchFrame = { v: 1, op: "command", request: "r", token: "t", seq: 1, command: values.slice(7) };
    const good = reply(frame, { accepted: 2, totalAccepted: 2, processed: 1 });
    expect(parseBatchProcessingResult(BATCH_RESULT_PREFIX + JSON.stringify(good))).toEqual(good);
    for (const bad of [{ ...good, totalAccepted: 1 }, { ...good, accepted: -1 }, { ...good, seq: 1.5 }, { ...good, success: false }, { ...good, protocol: "wrong" }]) expect(() => parseBatchProcessingResult(BATCH_RESULT_PREFIX + JSON.stringify(bad))).toThrow();
    expect(() => encodeBatchFrame({ ...frame, seq: 1.00000001 })).toThrow();
  });
  test("abort cannot invent values or a wipe when no data command was sent", async () => {
    for (const inflation of [{ totalAccepted: 9 }, { cleared: true }]) {
      const controller = new AbortController();
      const result = await runAcknowledgedBatch([wipe], async (frame) => {
        if (frame.op === "begin") { controller.abort(); return reply(frame); }
        return reply(frame, { success: false, state: "aborted", ...inflation });
      }, { ...options(), signal: controller.signal });
      expect(result).toMatchObject({ success: false, status: "unconfirmed", commandsSent: 0, commandsSucceeded: 0, acceptedValues: 0, configurationCleared: false });
    }
  });
  test("unchanged successful-command count cannot gain abort totals", async () => {
    const result = await runAcknowledgedBatch([values, next], async (frame) => {
      if (frame.op === "begin") return reply(frame);
      if (frame.op === "command" && frame.seq === 1) return reply(frame, { accepted: 2, totalAccepted: 2, processed: 1 });
      if (frame.op === "command") throw new Error("Missing result");
      return reply(frame, { success: false, state: "aborted", totalAccepted: 9, processed: 1 });
    }, options());
    expect(result).toMatchObject({ success: false, status: "unconfirmed", commandsSucceeded: 1, acceptedValues: 2, configurationCleared: false });
  });
});
