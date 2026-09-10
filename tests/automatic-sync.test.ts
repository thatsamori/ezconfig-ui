import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { AutomaticSyncResponder, type SyncEvent, type SyncListener } from "../src/lib/rcon/automatic-sync";
import { acquireSyncOwnership, defaultSyncOwnershipPort } from "../src/lib/rcon/sync-ownership";
import { isSyncRequest } from "../src/lib/rcon/sync-listener";
import { buildRconCommands } from "../src/lib/database/apply";
import type { BatchApplyResult } from "../src/lib/rcon/batch";
import { automaticSyncOptions, registerAutomaticSync, stopRegisteredAutomaticSync } from "../src/lib/rcon/automatic-sync-bootstrap";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
async function until(check: () => boolean) {
  const end = Date.now() + 1_500;
  while (!check()) { if (Date.now() > end) throw new Error("Test lifecycle did not settle"); await Bun.sleep(2); }
}
const commands = ['string ezconfig WipeDatabases', 'string ezconfig Character Stun {"OutOfStaminaStunDuration":"0.6"}'];
const complete: BatchApplyResult = { success: true, status: "complete", commandsSent: 2, commandsSucceeded: 2, acceptedValues: 1, ignoredKeys: 0, configurationCleared: true, serverState: "complete" };
const failed: BatchApplyResult = { ...complete, success: false, status: "incomplete", commandsSucceeded: 1, acceptedValues: 0, serverState: "failed", error: "Rejected value" };
function connection(request: () => void) {
  const ended = deferred<void>();
  let closes = 0;
  const listener: SyncListener = { closed: ended.promise, close: async () => { closes++; ended.resolve(); } };
  return { request, ended, listener, get closes() { return closes; } };
}

test("exact native request only; result and unrelated text cannot trigger synchronization", () => {
  expect(isSyncRequest("Custom: ezconfig requestupdate")).toBe(true);
  for (const text of ["ezconfig requestupdate", "Chat: ezconfig requestupdate", "Custom: EZCONFIG_RESULT ezconfig requestupdate", "Custom: ezconfig requestupdate extra", "Custom: Custom: ezconfig requestupdate"]) expect(isSyncRequest(text)).toBe(false);
});

test("bursts before admission coalesce, but an identical later actor request gets a fresh batch", async () => {
  const snapshot = deferred<readonly string[]>(), applied = deferred<BatchApplyResult>();
  let listener!: ReturnType<typeof connection>, reads = 0, applies = 0;
  const events: SyncEvent[] = [];
  const responder = new AutomaticSyncResponder({
    connect: async (_signal, request) => (listener = connection(request)).listener,
    snapshot: async () => ++reads === 1 ? snapshot.promise : commands,
    apply: async () => ++applies === 1 ? applied.promise : complete,
    event: (event) => { events.push(event); }, retryDelayMs: 10,
  });
  responder.start();
  try {
    await until(() => reads === 1);
    for (let i = 0; i < 5; i++) listener.request();
    snapshot.resolve(commands); await until(() => applies === 1);
    for (let i = 0; i < 5; i++) listener.request();
    applied.resolve(complete);
    await until(() => events.filter((event) => event.kind === "completed").length === 2);
    expect(reads).toBe(2); expect(applies).toBe(2);
  } finally { await responder.stop(); }
});

test("failure has no retry, while a later explicit trigger survives and starts fresh", async () => {
  let listener!: ReturnType<typeof connection>, applies = 0;
  const first = deferred<BatchApplyResult>();
  const responder = new AutomaticSyncResponder({ connect: async (_s, r) => (listener = connection(r)).listener,
    snapshot: async () => commands, apply: async () => ++applies === 1 ? first.promise : failed, retryDelayMs: 5 });
  responder.start();
  try {
    await until(() => applies === 1); listener.request(); first.resolve(failed);
    await until(() => applies === 2); await Bun.sleep(30); expect(applies).toBe(2);
    listener.request(); await until(() => applies === 3);
  } finally { await responder.stop(); }
});

test("disconnect during snapshot prevents admission; reconnect reads fresh and ignores stale callbacks", async () => {
  const listeners: ReturnType<typeof connection>[] = [], oldSnapshot = deferred<readonly string[]>();
  let reads = 0, applies = 0;
  const responder = new AutomaticSyncResponder({
    connect: async (_s, r) => { const c = connection(r); listeners.push(c); return c.listener; },
    snapshot: async () => ++reads === 1 ? oldSnapshot.promise : commands,
    apply: async () => { applies++; return complete; }, retryDelayMs: 5,
  });
  responder.start();
  try {
    await until(() => reads === 1); listeners[0].ended.resolve(); await Bun.sleep(5);
    oldSnapshot.resolve(commands); await until(() => listeners.length === 2 && applies === 1);
    expect(reads).toBe(2); listeners[0].request(); await Bun.sleep(15); expect(applies).toBe(1);
    listeners[1].request(); await until(() => applies === 2);
  } finally { await responder.stop(); }
});

test("stop aborts active work, closes listener and prevents queued or stale work", async () => {
  let listener!: ReturnType<typeof connection>, applies = 0, aborted = false;
  const responder = new AutomaticSyncResponder({ connect: async (_s, r) => (listener = connection(r)).listener,
    snapshot: async () => commands,
    apply: async (_commands, signal) => { applies++; return new Promise((resolve) => signal.addEventListener("abort", () => { aborted = true; resolve(failed); }, { once: true })); }, retryDelayMs: 5 });
  responder.start(); await until(() => applies === 1); listener.request();
  await responder.stop(); listener.request(); await Bun.sleep(15);
  expect(aborted).toBe(true); expect(listener.closes).toBeGreaterThan(0); expect(applies).toBe(1);
});

test("a reporting failure preserves confirmed completion without replay", async () => {
  let applies = 0, records = 0;
  const responder = new AutomaticSyncResponder({ connect: async (_s, r) => connection(r).listener, snapshot: async () => commands,
    apply: async () => { applies++; return complete; },
    event: (event) => { if (event.kind === "completed") throw new Error("Recording unavailable"); if (event.kind === "record-failed") records++; } });
  responder.start();
  try { await until(() => records === 1); await Bun.sleep(10); expect(applies).toBe(1); }
  finally { await responder.stop(); }
});

test("strict automatic snapshots reject corrupt/typed-invalid/unknown storage before producing a wipe", async () => {
  const root = await mkdtemp(join(tmpdir(), "ezconfig-sync-storage-"));
  try {
    await expect(buildRconCommands({ databasesRoot: join(root, "missing"), strictStorage: true })).rejects.toThrow();
    expect(await buildRconCommands({ databasesRoot: root, strictStorage: true })).toEqual([]);
    await mkdir(join(root, "Character")); const file = join(root, "Character", "Movement.json");
    for (const data of ['{', '[]', '{"CanDodge":"false"}', '{"UnknownStoredKey":1}', '{"TimeToMaxSprint":1e999}']) {
      await writeFile(file, data); await expect(buildRconCommands({ databasesRoot: root, strictStorage: true })).rejects.toThrow();
    }
    await writeFile(file, '{"CanDodge":false}');
    expect(await buildRconCommands({ databasesRoot: root, strictStorage: true })).toEqual(['string ezconfig Character Movement {"CanDodge":"False"}']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("ownership is exclusive, deterministic and released for another local process", async () => {
  expect(defaultSyncOwnershipPort("localhost", 17947)).toBe(defaultSyncOwnershipPort("127.0.0.1", 17947));
  const probe = createServer(); await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as { port: number }).port; await new Promise<void>((resolve) => probe.close(() => resolve()));
  const first = await acquireSyncOwnership(port);
  try { await expect(acquireSyncOwnership(port)).rejects.toThrow(); }
  finally { await first.release(); }
  const second = await acquireSyncOwnership(port); await second.release();
});

test("bootstrap is explicitly disabled for normal defaults/build/edge; duplicate registration starts once", async () => {
  const explicit = { NEXT_RUNTIME: "nodejs", RCON_AUTO_SYNC_ENABLED: "true", RCON_HOST: "127.0.0.1", RCON_PORT: "17947", RCON_PASSWORD: "isolated-placeholder", DATABASES_PATH: "./isolated-test-only" };
  expect(automaticSyncOptions({})).toBeNull();
  expect(automaticSyncOptions({ ...explicit, NEXT_PHASE: "phase-production-build" })).toBeNull();
  expect(automaticSyncOptions({ ...explicit, NEXT_RUNTIME: "edge" })).toBeNull();
  expect(() => automaticSyncOptions({ ...explicit, RCON_PASSWORD: "" })).toThrow();
  let starts = 0, stops = 0;
  const start = () => { starts++; return { stop: async () => { stops++; } }; };
  try {
    await Promise.all(Array.from({ length: 5 }, () => registerAutomaticSync(explicit, start)));
    expect(starts).toBe(1); expect(stops).toBe(0);
    await registerAutomaticSync({ ...explicit, RCON_AUTO_SYNC_ENABLED: "false" }, start);
    expect(starts).toBe(1); expect(stops).toBe(1);
  } finally { await stopRegisteredAutomaticSync(); }
});
