/** Real store/persistence/review/API/sender, with controlled server-result exchange. */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { runAcknowledgedBatch } from "../../src/lib/rcon/batch";
import { BATCH_PROTOCOL, encodeBatchFrame, type BatchFrame, type BatchProcessingResult } from "../../src/lib/rcon/batch-protocol";
import { applyFeedback } from "../../src/lib/rcon/apply-feedback";

const parent = resolve(tmpdir()); const root = await mkdtemp(join(parent, "ezconfig-batch-apply-"));
process.env.DATABASES_PATH = root;
const originalFetch = globalThis.fetch; const originalError = console.error;
let mode = "success", request = 0, run = 0;
const captures: { mode: string; commands: readonly string[]; frames: BatchFrame[]; wire: string[] }[] = [];
const metadataErrors: unknown[][] = [];
mock.module("../../src/lib/rcon/service", () => ({
  executeAcknowledgedBatch: async (commands: readonly string[], options: { signal?: AbortSignal } = {}) => {
    const capture = { mode, commands: [...commands], frames: [] as BatchFrame[], wire: [] as string[] }; captures.push(capture);
    const token = `fixture-token-${++run}`; let processed = 0, accepted = 0, cleared = false;
    let state: BatchProcessingResult["state"] = "active";
    return runAcknowledgedBatch(commands, async (frame) => {
      capture.frames.push(frame); capture.wire.push(encodeBatchFrame(frame));
      const reply = (extra: Partial<BatchProcessingResult> = {}): BatchProcessingResult => ({ protocol: BATCH_PROTOCOL, request: frame.request, op: frame.op, token, seq: "seq" in frame ? frame.seq : 0, success: state === "active" || state === "complete", accepted: 0, ignored: 0, totalAccepted: accepted, totalIgnored: 0, processed, cleared, state, reason: "", ...extra });
      if (frame.op === "begin") {
        if (mode === "denied") return reply({ success: false, state: "rejected", token: "", reason: "Another apply is active" });
        return reply({ maxCommands: 2_048, idleTimeoutSeconds: 30 });
      }
      if (frame.op === "command") {
        if ((mode === "reject-after-wipe" && frame.seq === 2) || (mode === "reject-after-values" && frame.seq === 3)) {
          state = "failed"; return reply({ reason: "Controlled server rejection" });
        }
        // Uniform acceptance of known-valid fixture fields, not a replacement
        // native parser. Rejection outcomes above are controlled independently.
        const wipe = frame.command === "ezconfig WipeDatabases";
        const count = wipe ? 0 : Object.keys(JSON.parse(frame.command.slice(frame.command.indexOf("{")))).length;
        processed++; accepted += count; cleared ||= wipe;
        if (mode === "missing-command" && frame.seq === 2) throw new Error("Command result missing");
        return reply({ accepted: count });
      }
      if (frame.op === "end") {
        state = "complete";
        if (mode === "late-end") throw new Error("Completion result missing");
        return reply();
      }
      if (state === "active") state = "aborted";
      return reply();
    }, { ...options, requestId: () => `fixture-request-${++request}` });
  },
}));
try {
  const { POST: save } = await import("../../src/app/api/config/[...path]/route");
  const { GET: preview } = await import("../../src/app/api/apply/preview/route");
  const { POST: apply } = await import("../../src/app/api/apply/route");
  const { readApplyRecord } = await import("../../src/lib/database/applyRecord");
  const { useConfigStore, flushConfigWrites } = await import("../../src/lib/store/configStore");
  const { reviewRows, selectedReviewCommands } = await import("../../src/components/console/model");
  globalThis.fetch = (async (url: string, init: RequestInit) => save(new Request("http://localhost" + url, init) as never, { params: Promise.resolve({ path: url.slice("/api/config/".length).split("/") }) })) as unknown as typeof fetch;
  const store = useConfigStore.getState();
  store.setValue("Character", "Combat", "StaminaCostModifier", 1.2);
  store.setValue("Character", "Combat", "MeleeWindupModifier", .8);
  store.setValue("Weapon/ArmingSword", "Strike", "Damage", [1, 2, 3, 4]);
  store.setValue("Weapon/ArmingSword", "Strike", "Windup", .6);
  await flushConfigWrites();
  const view = await preview(); assert.equal(view.status, 200);
  const previewData = await view.json();
  const rows = reviewRows(previewData.commands); assert.equal(rows.length, 4);
  const all = selectedReviewCommands(rows, new Set(rows.map((row) => row.id)));
  const selectedRow = rows.find((row) => row.key === "Damage")!;
  const selected = selectedReviewCommands(rows, new Set([selectedRow.id]));
  const submit = async (body: unknown) => {
    const response = await apply(new Request("http://localhost/api/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  const full = await submit({}); assert.equal(full.status, 200); assert.equal(full.body.acceptedValues, 4); assert.equal(full.body.commandsSucceeded, 3);
  assert.equal(captures.at(-1)!.frames[0].op, "begin"); assert.equal(captures.at(-1)!.frames.at(-1)!.op, "end");
  assert.deepEqual(captures.at(-1)!.commands, ["string ezconfig WipeDatabases", ...previewData.commands]);
  assert.equal((await readApplyRecord())!.values, 4);
  const single = await submit({ commands: selected, wipeDatabase: false }); assert.equal(single.body.acceptedValues, 1); assert.equal(single.body.configurationCleared, false);
  assert.equal((captures.at(-1)!.frames[1] as Extract<BatchFrame, { op: "command" }>).command, selected[0].slice(7));
  const history = await readFile(join(root, ".last-apply.json"), "utf8");
  for (const failMode of ["denied", "reject-after-wipe", "reject-after-values", "missing-command"]) {
    mode = failMode;
    const failed = await submit({ commands: all, wipeDatabase: true }); assert.equal(failed.body.success, false);
    assert.equal(await readFile(join(root, ".last-apply.json"), "utf8"), history);
    const frames = captures.at(-1)!.frames;
    if (mode === "denied") { assert.deepEqual(frames.map((f) => f.op), ["begin"]); assert.equal(failed.body.configurationCleared, false); }
    else {
      assert.equal(failed.body.configurationCleared, true);
      assert.equal(failed.body.acceptedValues, mode === "reject-after-wipe" ? 0 : 2);
      assert.equal(frames.at(-1)!.op, mode === "missing-command" ? "abort" : "command");
    }
  }
  mode = "late-end";
  const recovered = await submit({ commands: all, wipeDatabase: true });
  assert.equal(recovered.status, 200); assert.equal(recovered.body.success, false); assert.equal(recovered.body.serverState, "complete");
  assert.match(applyFeedback(recovered.body, "test server"), /Server reported completion/);
  assert.equal((await readApplyRecord())!.values, 4); // Actual confirmed completion is recorded.
  assert.deepEqual(captures.at(-1)!.frames.map((f) => f.op), ["begin", "command", "command", "command", "end", "abort"]);
  mode = "success";
  for (const wipeDatabase of [false, true]) {
    const empty = await submit({ commands: [], wipeDatabase }); assert.equal(empty.body.success, true); assert.equal(empty.body.acceptedValues, 0); assert.equal(empty.body.configurationCleared, wipeDatabase);
  }
  // Force only the metadata write to fail after confirmed processing.
  await rename(join(root, ".last-apply.json"), join(root, ".last-apply.previous")); await mkdir(join(root, ".last-apply.json"));
  console.error = (...args: unknown[]) => metadataErrors.push(args);
  const metadataFailure = await submit({ commands: selected, wipeDatabase: false });
  assert.equal(metadataFailure.body.success, true); assert.equal(metadataFailure.body.acceptedValues, 1); assert.match(metadataFailure.body.metadataWarning, /history could not be saved/);
  assert.equal(metadataErrors.length, 1); assert.equal(captures.at(-1)!.frames.filter((f) => f.op === "command").length, 1);
  await flushConfigWrites(); const stillSaved = await preview(); assert.equal(reviewRows((await stillSaved.json()).commands).length, 4);
  if (process.env.EZ_BATCH_CAPTURE_PATH) await writeFile(process.env.EZ_BATCH_CAPTURE_PATH, JSON.stringify(captures, null, 2));
  console.log("PASS: acknowledged full/selected apply, captured framing, fail-stop/progress, empty operations, confirmed completion and independent metadata failure");
} finally {
  globalThis.fetch = originalFetch; console.error = originalError;
  const target = resolve(root); assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith("ezconfig-batch-apply-"));
  await rm(target, { recursive: true, force: true });
}
