import { resolve } from "node:path";
import { AutomaticSyncResponder, waitForSyncRetry, type SyncEvent } from "./automatic-sync";
import { acquireSyncOwnership, defaultSyncOwnershipPort } from "./sync-ownership";
import { connectSyncListener } from "./sync-listener";
import { executeAcknowledgedBatchAt, type RconConfig } from "./service";
import { buildRconCommands } from "../database/apply";

export interface AutomaticSyncOptions {
  rcon: RconConfig;
  databasesRoot: string;
  ownershipPort?: number;
  retryDelayMs?: number;
  event?(event: SyncEvent | { kind: "ownership-unavailable"; port: number; error: string }): void | Promise<void>;
}
export interface AutomaticSyncRuntime { stop(): Promise<void> }

/** Explicit configuration only. Importing this module never opens a connection. */
export function startAutomaticSyncRuntime(options: AutomaticSyncOptions): AutomaticSyncRuntime {
  const stopping = new AbortController();
  const rcon = { ...options.rcon };
  if (!rcon.host.trim() || !Number.isInteger(rcon.port) || rcon.port < 1 || rcon.port > 65535 || !rcon.password || !options.databasesRoot) throw new Error("Invalid automatic-sync configuration");
  const databasesRoot = resolve(options.databasesRoot);
  const port = options.ownershipPort ?? defaultSyncOwnershipPort(rcon.host, rcon.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid automatic-sync ownership port");
  let wake!: () => void;
  const stopped = new Promise<void>((resolve) => { wake = resolve; });
  let responder: AutomaticSyncResponder | undefined;
  const report = async (event: Parameters<NonNullable<AutomaticSyncOptions["event"]>>[0]) => {
    if (options.event) { await options.event(event); return; }
    if (event.kind === "completed") {
      const r = event.result;
      console.info(`[EZConfig sync] ${r.status}: ${r.commandsSucceeded} commands, ${r.acceptedValues} accepted values, ${r.ignoredKeys} ignored keys, cleared=${r.configurationCleared}`);
    } else if ("error" in event) {
      console.error(`[EZConfig sync] ${event.kind}: ${event.error.replaceAll(rcon.password, "[redacted]")}`);
    }
  };
  const lifetime = (async () => {
    let delayMs = options.retryDelayMs ?? 1_000;
    while (!stopping.signal.aborted) {
      let ownership;
      try { ownership = await acquireSyncOwnership(port); }
      catch (error) {
        await report({ kind: "ownership-unavailable", port, error: error instanceof Error ? error.message : String(error) }).catch(() => {});
        await waitForSyncRetry(delayMs, stopping.signal);
        delayMs = Math.min(delayMs * 2, 30_000);
        continue;
      }
      try {
        if (stopping.signal.aborted) break;
        responder = new AutomaticSyncResponder({
          connect: (signal, request) => connectSyncListener(rcon, signal, request),
          snapshot: async () => ["string ezconfig WipeDatabases", ...await buildRconCommands({ databasesRoot, strictStorage: true })],
          apply: (commands, signal) => executeAcknowledgedBatchAt(rcon, commands, { signal }),
          retryDelayMs: options.retryDelayMs,
          event: report,
        });
        responder.start();
        await Promise.race([stopped, ownership.closed]);
      } finally {
        await responder?.stop();
        responder = undefined;
        await ownership.release();
      }
    }
  })();
  // The runtime is nonblocking for Next startup, but failures remain observable.
  void lifetime.catch((error) => report({ kind: "connection-failed", error: error instanceof Error ? error.message : String(error) }).catch(() => {}));
  let stop: Promise<void> | undefined;
  return { stop() {
    if (!stop) {
      stopping.abort(); wake();
      stop = lifetime;
    }
    return stop;
  } };
}
