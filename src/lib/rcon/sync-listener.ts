import { Rcon } from "rcon-client";
import type { Socket } from "node:net";
import type { RconConfig } from "./service";
import { observeRconPayloads, prepareProcessingResultReceiver } from "./processing";
import type { SyncListener } from "./automatic-sync";

/** The existing mod request, carried by Mordhau's verified native envelope. */
export const isSyncRequest = (payload: string) => payload === "Custom: ezconfig requestupdate";

export async function connectSyncListener(
  config: RconConfig,
  signal: AbortSignal,
  requestUpdate: () => void,
): Promise<SyncListener> {
  const client = new Rcon({ ...config, timeout: 5_000 });
  let disconnected!: () => void;
  const closed = new Promise<void>((resolve) => { disconnected = resolve; });
  let closing: Promise<void> | undefined;
  let unobserve: (() => void) | undefined;
  const close = (): Promise<void> => {
    if (closing) return closing;
    closing = (async () => {
      signal.removeEventListener("abort", onAbort);
      unobserve?.();
      const socket = (client as unknown as { socket?: Socket }).socket;
      await Promise.race([client.end().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1_000))]);
      socket?.destroy();
      disconnected();
    })();
    return closing;
  };
  const onAbort = () => { void close(); };
  client.on("error", () => { void close(); });
  client.on("end", disconnected);
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) throw new Error("Automatic synchronization stopped");
    await client.connect();
    if (signal.aborted || closing) throw new Error("Automatic synchronization stopped");
    prepareProcessingResultReceiver(client);
    unobserve = observeRconPayloads(client, (payload) => {
      if (!signal.aborted && !closing && isSyncRequest(payload)) requestUpdate();
    });
    const reply = await client.send("listen custom");
    if (!reply.includes("Now listening to custom")) throw new Error("Server did not enable automatic-sync subscription");
    return { closed, close };
  } catch (error) {
    await close();
    throw error;
  }
}
