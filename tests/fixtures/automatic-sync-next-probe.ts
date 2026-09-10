/** Actual Next production runtime plus a transparent local interruption proxy. */
import next from "next";
import { createServer as createHttpServer } from "node:http";
import { connect as connectSocket, createServer, type Socket } from "node:net";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Rcon } from "rcon-client";
import { stopRegisteredAutomaticSync } from "../../src/lib/rcon/automatic-sync-bootstrap";

const [configuration, output] = process.argv.slice(2);
if (!configuration || !output) throw new Error("Explicit isolated configuration/evidence paths required");
const config = JSON.parse(await readFile(configuration, "utf8"));
if (config.host !== "127.0.0.1" || config.nativePort !== 17947 || config.port !== 17948 || config.httpPort !== 17980 || config.ownershipPort !== 17981) throw new Error("Only the agreed isolated loopback test ports are allowed");
if (process.env.RCON_HOST !== config.host || process.env.RCON_PORT !== String(config.port) || process.env.RCON_PASSWORD !== config.password || process.env.DATABASES_PATH !== config.databasesRoot || process.env.RCON_AUTO_SYNC_ENABLED !== "true") throw new Error("Isolated environment must be injected before process startup");

type Peer = { id: number; client: Socket; server: Socket; commands: string[]; owner: boolean; subscribed: boolean; confirmed: number; dropAfter?: number; closed: boolean };
const peers: Peer[] = [], wire: unknown[] = [], batches: Record<string, unknown>[] = [], phases: unknown[] = [], appLogs: string[] = [];
let dropNextOwnerAfter: number | undefined;
let nextId = 0;
const originalInfo = console.info, originalError = console.error;
for (const method of ["info", "error"] as const) {
  const original = console[method];
  console[method] = (...args: unknown[]) => {
    const message = args.map(String).join(" ");
    if (message.startsWith("[EZConfig sync]")) appLogs.push(message);
    original(...args);
  };
}
function decoder(onPacket: (packet: Buffer) => void) {
  let bytes = Buffer.alloc(0);
  return (chunk: Buffer) => {
    bytes = Buffer.concat([bytes, chunk]);
    while (bytes.length >= 4) {
      const size = bytes.readInt32LE(0);
      if (size < 10 || size > 1_048_576) throw new Error("Invalid actual RCON frame");
      if (bytes.length < size + 4) return;
      const packet = bytes.subarray(0, size + 4); bytes = bytes.subarray(size + 4);
      onPacket(packet);
    }
  };
}
const proxy = createServer((client) => {
  const server = connectSocket({ host: config.host, port: config.nativePort });
  const peer: Peer = { id: ++nextId, client, server, commands: [], owner: false, subscribed: false, confirmed: 0, closed: false };
  peers.push(peer);
  const close = () => { peer.closed = true; client.destroy(); server.destroy(); };
  client.on("error", close); server.on("error", close);
  client.on("close", close); server.on("close", close);
  client.on("data", decoder((packet) => {
    const type = packet.readInt32LE(8);
    // Authentication bytes are forwarded, never recorded or decoded as text.
    if (type === 3) { server.write(packet); return; }
    const command = packet.subarray(12, -2).toString("utf8");
    peer.commands.push(command);
    if (command.startsWith("string ezconfig batch ")) {
      const frame = JSON.parse(command.slice("string ezconfig batch ".length));
      if (frame.op === "begin") {
        peer.owner = true;
        peer.dropAfter = dropNextOwnerAfter;
        dropNextOwnerAfter = undefined;
        batches.push({ peer: peer.id, request: frame.request, startedAt: performance.now() });
      }
      if (frame.op === "command" && peer.dropAfter !== undefined && peer.confirmed >= peer.dropAfter) {
        phases.push({ interruption: "closed before forwarding the next real command", peer: peer.id, confirmed: peer.confirmed, withheldSequence: frame.seq });
        close(); return;
      }
    }
    server.write(packet);
  }));
  server.on("data", decoder((packet) => {
    const body = packet.subarray(12, -2).toString("utf8");
    if (body.includes("Now listening to custom")) peer.subscribed = true;
    if (body.startsWith("Custom: ezconfig requestupdate") || body.startsWith("Custom: EZCONFIG_")) {
      wire.push({ peer: peer.id, at: performance.now(), id: packet.readInt32LE(4), type: packet.readInt32LE(8), body, wire_hex: packet.toString("hex") });
      if (body.startsWith("Custom: EZCONFIG_BATCH_RESULT ")) {
        const reply = JSON.parse(body.slice("Custom: EZCONFIG_BATCH_RESULT ".length));
        if (reply.op === "command" && reply.success) peer.confirmed = reply.processed;
        const batch = batches.findLast((item) => item.peer === peer.id);
        if (batch) { const replies = (batch.replies ??= []) as unknown[]; replies.push(reply); }
      }
    }
    client.write(packet);
  }));
});
const app = next({ dev: false, dir: process.cwd(), hostname: "127.0.0.1", port: config.httpPort });
const http = createHttpServer((req, res) => { void app.getRequestHandler()(req, res); });
const control = new Rcon({ host: config.host, port: config.nativePort, password: config.password, timeout: 5_000 });
control.on("error", () => {});
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, timeout = 12_000) {
  const end = Date.now() + timeout;
  while (!check()) { if (Date.now() >= end) throw new Error("Actual Next synchronization did not reach the expected boundary"); await sleep(20); }
}
const completed = () => batches.filter((batch) => (batch.replies as { state: string; op: string }[] | undefined)?.some((r) => r.state === "complete" && r.op === "end"));
async function reloadAndComplete() {
  const count = completed().length;
  await control.send("string ezconfig reload");
  await until(() => completed().length === count + 1);
}
const evidence: Record<string, unknown> = { realNext: true, realNativeServer: true, productionBootstrapExplicitlyEnabledForIsolatedTest: true, authBytesRecorded: false, phases, wire, batches, appLogs };
try {
  await new Promise<void>((resolve) => proxy.listen(config.port, config.host, resolve));
  await control.connect();
  await app.prepare();
  await new Promise<void>((resolve) => http.listen(config.httpPort, config.host, resolve));
  if (config.startupOnly) {
    if (!Array.isArray(config.expectedCommands) || config.expectedCommands.length !== 4) throw new Error("Expected the exact combined UI snapshot");
    await until(() => peers.some((peer) => !peer.closed && !peer.owner && peer.subscribed));
    phases.push({ listenerReadyBeforeGameplayTravel: true });
    for (let mapStart = 1; mapStart <= 2; mapStart++) {
      const observedListener = peers.find((peer) => !peer.closed && !peer.owner && peer.subscribed);
      if (!observedListener) throw new Error("Persistent listener must be subscribed before each map startup");
      const requests = () => wire.filter((frame) => {
        const value = frame as { peer: number; body: string };
        return value.peer === observedListener.id && value.body === "Custom: ezconfig requestupdate";
      });
      const requestCount = () => requests().length;
      const beforeRequests = requestCount(), beforeCompleted = completed().length;
      phases.push({ mapStart, observedListenerPeer: observedListener.id, beforeRequests, beforeCompleted, nativeChangeLevelRequestedAt: Date.now() });
      const response = await control.send("changelevel FFA_ThePit");
      if (!response.includes("Successfully changed level")) throw new Error("Native gameplay travel rejected");
      const freshCompletion = () => {
        const request = requests()[beforeRequests] as { at: number } | undefined;
        return request && completed().findLast((batch) => Number(batch.startedAt) >= request.at);
      };
      await until(() => requestCount() > beforeRequests && !!freshCompletion(), 20_000);
      // Allow queued later startup signals to settle before checking uniqueness.
      await sleep(500);
      if (requestCount() !== beforeRequests + 1) throw new Error("Duplicate or missing startup request on the observed listener");
      const request = requests()[beforeRequests] as { at: number };
      const windowEnd = performance.now();
      // Admissions initiated before this actual request belong to an earlier
      // connection/map attempt, not to the startup batch being proved here.
      const qualifying = batches.filter((batch) => Number(batch.startedAt) >= request.at && Number(batch.startedAt) <= windowEnd);
      const admitted = qualifying.filter((batch) => (batch.replies as { op: string; success: boolean; state: string }[] | undefined)?.some((reply) => reply.op === "begin" && reply.success && reply.state === "active"));
      const finished = admitted.filter((batch) => completed().includes(batch));
      if (admitted.length !== 1 || finished.length !== 1) throw new Error("Startup request must produce exactly one admitted and completed fresh batch");
      const batch = finished[0];
      const peer = peers.find((peer) => peer.id === batch.peer)!;
      const sent = peer.commands.filter((command) => command.startsWith("string ezconfig batch "))
        .map((command) => JSON.parse(command.slice("string ezconfig batch ".length)))
        .filter((frame) => frame.op === "command").map((frame) => "string " + frame.command);
      if (JSON.stringify(sent) !== JSON.stringify(config.expectedCommands)) throw new Error("Startup snapshot differs from captured real UI persistence");
      const terminals = (batch.replies as { op: string; totalAccepted: number; totalIgnored: number; processed: number; cleared: boolean }[]).filter((reply) => reply.op === "end");
      if (terminals.length !== 1) throw new Error("Startup batch produced duplicate terminal results");
      const terminal = terminals[0];
      if (terminal.totalAccepted !== 8 || terminal.totalIgnored !== 0 || terminal.processed !== 4 || !terminal.cleared) throw new Error("Combined startup terminal counts differ");
      phases.push({ mapStart, oneObservedStartupRequest: true, postRequestAttempts: qualifying.length, postRequestAdmissions: admitted.length, postRequestCompletions: finished.length, earlierAttemptsExcluded: batches.length - qualifying.length, unchangedSnapshotStillApplied: mapStart === 2, exactCombinedCommands: sent, terminal });
    }
  } else {
  await until(() => completed().length === 1);
  phases.push({ startup: "actual Next instrumentation", completed: completed().length });
  await writeFile(join(config.databasesRoot, "Character", "Stun.json"), '{"OutOfStaminaStunDuration":0.8}');
  const listener = peers.find((peer) => !peer.closed && !peer.owner && peer.commands.includes("listen custom"));
  if (!listener) throw new Error("Persistent listener not identified");
  listener.client.destroy(); listener.server.destroy();
  await until(() => completed().length === 2);
  phases.push({ reconnect: "closed only the actual listener socket", oldPeer: listener.id, completed: completed().length });
  await reloadAndComplete(); await reloadAndComplete();
  phases.push({ nativeReloadAndUnchangedReload: true, completed: completed().length });
  const beforeManual = batches.length;
  const manual = await fetch(`http://127.0.0.1:${config.httpPort}/api/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commands: ['string ezconfig Character Stun {"OutOfStaminaStunDuration":"0.9"}'], wipeDatabase: false }) });
  const manualResult = await manual.json();
  if (!manualResult.success) throw new Error("Manual selected apply regressed");
  await sleep(200); if (batches.length !== beforeManual + 1) throw new Error("Result broadcast caused a responder feedback loop");
  phases.push({ manualSelectedApply: manualResult, noFeedbackLoop: true });
  await writeFile(join(config.databasesRoot, "Character", "Stun.json"), '{"OutOfStaminaStunDuration":"invalid"}');
  const beforeInvalid = batches.length;
  await control.send("string ezconfig reload");
  await until(() => appLogs.some((line) => line.includes("snapshot-failed")));
  if (batches.length !== beforeInvalid) throw new Error("Invalid persisted data reached admission/wipe");
  phases.push({ invalidStorageBeforeAdmission: true });
  await writeFile(join(config.databasesRoot, "Character", "Stun.json"), "{}");
  await writeFile(join(config.databasesRoot, "Character", "Combat.json"), "{}");
  await reloadAndComplete();
  const wipeOnly = completed().at(-1)!;
  const wipeTerminal = (wipeOnly.replies as { op: string; totalAccepted: number; processed: number; cleared: boolean }[]).find((r) => r.op === "end")!;
  if (wipeTerminal.totalAccepted !== 0 || wipeTerminal.processed !== 1 || !wipeTerminal.cleared) throw new Error("Empty saved snapshot was not wipe-only");
  phases.push({ emptyWipeOnly: true });
  await writeFile(join(config.databasesRoot, "Character", "Stun.json"), '{"OutOfStaminaStunDuration":0.6}');
  await writeFile(join(config.databasesRoot, "Character", "Combat.json"), '{"StaminaCostModifier":1.2}');
  for (const after of [1, 2]) {
    const before = batches.length, failedLogs = appLogs.filter((line) => line.includes("unconfirmed:")).length;
    dropNextOwnerAfter = after;
    await control.send("string ezconfig reload");
    await until(() => appLogs.filter((line) => line.includes("unconfirmed:")).length > failedLogs);
    if (batches.length !== before + 1) throw new Error("Interrupted synchronization retried immediately");
    await sleep(31_200); // Actual native idle timeout, not a substituted result.
    if (batches.length !== before + 1) throw new Error("Failed synchronization automatically replayed without a new trigger");
    phases.push({ failureAfterConfirmedCommands: after, noAutomaticReplayForSeconds: 31.2 });
  }
  await reloadAndComplete();
  phases.push({ laterExplicitReloadRecovered: true });
  }
  evidence.passed = true;
} catch (error) {
  evidence.passed = false; evidence.error = error instanceof Error ? error.message : String(error); process.exitCode = 1;
} finally {
  const cleanupErrors: { step: string; error: string }[] = [];
  const cleanup = async (step: string, action: () => Promise<unknown>) => {
    try { await action(); } catch (error) { cleanupErrors.push({ step, error: error instanceof Error ? error.message : String(error) }); }
  };
  await cleanup("responder stop", stopRegisteredAutomaticSync);
  await cleanup("control close", () => control.end());
  for (const peer of peers) { peer.client.destroy(); peer.server.destroy(); }
  await cleanup("proxy close", () => new Promise<void>((resolve) => proxy.close(() => resolve())));
  await cleanup("HTTP close", () => new Promise<void>((resolve) => http.close(() => resolve())));
  await cleanup("Next close", () => app.close());
  evidence.cleanupErrors = cleanupErrors;
  if (cleanupErrors.length) { evidence.passed = false; process.exitCode = 1; }
  evidence.connectionRoles = peers.map(({ id, owner, commands, closed }) => ({ id, owner, commands, closed }));
  evidence.gracefulTestTeardown = "explicit responder.stop + app.close; stock Next CLI forced-exit behavior is not inferred";
  await writeFile(output, JSON.stringify(evidence, null, 2));
  console.info = originalInfo; console.error = originalError;
  console.log(JSON.stringify({ passed: evidence.passed, error: evidence.error, phases: phases.length, batches: batches.length }));
}
