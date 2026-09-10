import { createHash } from "node:crypto";
import { createServer } from "node:net";

export function defaultSyncOwnershipPort(host: string, port: number): number {
  const normalized = host.toLowerCase() === "localhost" ? "127.0.0.1" : host.toLowerCase();
  return 40_000 + createHash("sha256").update(`${normalized}:${port}`).digest().readUInt32BE(0) % 10_000;
}

export interface SyncOwnership { closed: Promise<void>; release(): Promise<void> }

/** OS exclusivity is released on crash; no stale PID files or background daemon. */
export async function acquireSyncOwnership(port: number): Promise<SyncOwnership> {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid automatic-sync ownership port");
  const server = createServer((socket) => socket.destroy());
  let ended!: () => void;
  const closed = new Promise<void>((resolve) => { ended = resolve; });
  server.once("close", ended);
  await new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => { server.close(); reject(error); };
    server.once("error", fail);
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      server.off("error", fail);
      server.on("error", () => { server.close(); });
      server.unref();
      resolve();
    });
  });
  let releasing: Promise<void> | undefined;
  return { closed, release() {
    return releasing ??= new Promise<void>((resolve) => {
      if (!server.listening) return resolve();
      server.close(() => resolve());
    });
  } };
}
