import { createHash } from "node:crypto";
import { startAutomaticSyncRuntime, type AutomaticSyncOptions, type AutomaticSyncRuntime } from "./automatic-sync-runtime";

type Registration = { queue: Promise<void>; fingerprint?: string; runtime?: AutomaticSyncRuntime; shutdown?: () => void };
type SyncEnvironment = Readonly<Record<string, string | undefined>>;
const registryKey = Symbol.for("ezconfig-ui.automatic-sync-registration.v1");
const processGlobals = globalThis as typeof globalThis & { [key: symbol]: Registration | undefined };
const registry = () => processGlobals[registryKey] ??= { queue: Promise.resolve() };

export function automaticSyncOptions(environment: SyncEnvironment): AutomaticSyncOptions | null {
  if (environment.NEXT_RUNTIME !== "nodejs" || environment.NEXT_PHASE === "phase-production-build" || environment.RCON_AUTO_SYNC_ENABLED !== "true") return null;
  const port = Number(environment.RCON_PORT || "27015");
  const password = environment.RCON_PASSWORD || "";
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !password) throw new Error("Automatic synchronization requires valid RCON_PORT and RCON_PASSWORD");
  const ownershipPort = environment.RCON_AUTO_SYNC_OWNER_PORT ? Number(environment.RCON_AUTO_SYNC_OWNER_PORT) : undefined;
  if (ownershipPort !== undefined && (!Number.isInteger(ownershipPort) || ownershipPort < 1024 || ownershipPort > 65535)) throw new Error("Invalid RCON_AUTO_SYNC_OWNER_PORT");
  return { rcon: { host: environment.RCON_HOST || "localhost", port, password }, databasesRoot: environment.DATABASES_PATH || "./Databases", ownershipPort };
}

async function stop(registration: Registration): Promise<void> {
  if (registration.shutdown) {
    for (const signal of ["SIGINT", "SIGTERM", "beforeExit"] as const) process.off(signal, registration.shutdown);
    registration.shutdown = undefined;
  }
  await registration.runtime?.stop();
  registration.runtime = undefined;
  registration.fingerprint = undefined;
}

/** Repeated Next/HMR registration cannot leave two app-owned responders alive. */
export async function registerAutomaticSync(
  environment: SyncEnvironment = process.env,
  start: (options: AutomaticSyncOptions) => AutomaticSyncRuntime = startAutomaticSyncRuntime,
): Promise<void> {
  const options = automaticSyncOptions(environment);
  if (!options) {
    if (environment.NEXT_RUNTIME === "nodejs" && environment.NEXT_PHASE !== "phase-production-build") await stopRegisteredAutomaticSync();
    return;
  }
  const registration = registry();
  const fingerprint = createHash("sha256").update(JSON.stringify(options)).digest("hex");
  const next = registration.queue.then(async () => {
    if (registration.runtime && registration.fingerprint === fingerprint) return;
    await stop(registration);
    registration.runtime = start(options);
    registration.fingerprint = fingerprint;
    registration.shutdown = () => { void stopRegisteredAutomaticSync().catch((error) => console.error("[EZConfig sync] shutdown failed", error instanceof Error ? error.message : "Unknown error")); };
    for (const signal of ["SIGINT", "SIGTERM", "beforeExit"] as const) process.once(signal, registration.shutdown);
  });
  registration.queue = next.catch(() => {});
  await next;
}

export async function stopRegisteredAutomaticSync(): Promise<void> {
  const registration = registry();
  const next = registration.queue.then(() => stop(registration));
  registration.queue = next.catch(() => {});
  await next;
}
