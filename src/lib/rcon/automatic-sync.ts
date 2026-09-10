import type { BatchApplyResult } from "./batch";

export type SyncTrigger = "startup" | "reconnect" | "server-request";
export type SyncEvent =
  | { kind: "connected"; generation: number }
  | { kind: "connection-failed"; error: string }
  | { kind: "snapshot-failed"; triggers: SyncTrigger[]; error: string }
  | { kind: "attempt-unconfirmed"; triggers: SyncTrigger[]; error: string }
  | { kind: "completed"; triggers: SyncTrigger[]; result: BatchApplyResult }
  | { kind: "record-failed"; error: string }
  | { kind: "stopped" };

export interface SyncListener {
  closed: Promise<void>;
  close(): Promise<void>;
}

export interface AutomaticSyncDependencies {
  connect(signal: AbortSignal, requestUpdate: () => void): Promise<SyncListener>;
  /** Fully prepares a replacement, including its wipe, before admission. */
  snapshot(): Promise<readonly string[]>;
  apply(commands: readonly string[], signal: AbortSignal): Promise<BatchApplyResult>;
  event?(event: SyncEvent): void | Promise<void>;
  retryDelayMs?: number;
  maximumRetryDelayMs?: number;
}

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export function waitForSyncRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

/** One listener lifecycle and one local sync drain; never resumes a failed batch. */
export class AutomaticSyncResponder {
  private readonly stopping = new AbortController();
  private generation = 0;
  private connectedBefore = false;
  private running?: Promise<void>;
  private drain?: Promise<void>;
  private activeAbort?: AbortController;
  private listener?: SyncListener;
  private pending = new Set<SyncTrigger>();

  constructor(private readonly dependencies: AutomaticSyncDependencies) {}

  start(): void {
    if (this.running || this.stopping.signal.aborted) return;
    this.running = this.listen();
  }

  async stop(): Promise<void> {
    this.stopping.abort();
    this.generation++;
    this.pending.clear();
    this.activeAbort?.abort();
    await this.listener?.close();
    await this.running;
    await this.drain;
  }

  private async emit(event: SyncEvent): Promise<void> {
    try { await this.dependencies.event?.(event); }
    catch (error) {
      // A recording failure cannot turn confirmed processing into a retry.
      if (event.kind !== "record-failed") {
        try { await this.dependencies.event?.({ kind: "record-failed", error: errorText(error) }); }
        catch { /* The app's reporting sink is unavailable; do not replay work. */ }
      }
    }
  }

  private request(trigger: SyncTrigger): void {
    if (this.stopping.signal.aborted) return;
    this.pending.add(trigger);
    if (this.drain) return;
    this.drain = this.synchronize().finally(() => {
      this.drain = undefined;
      // A trigger can arrive while the last reporting callback is completing.
      if (this.pending.size && !this.stopping.signal.aborted) this.request([...this.pending][0]);
    });
  }

  private async synchronize(): Promise<void> {
    while (this.pending.size && !this.stopping.signal.aborted) {
      const generation = this.generation;
      let triggers = [...this.pending];
      this.pending.clear();
      let commands: readonly string[];
      try { commands = [...await this.dependencies.snapshot()]; }
      catch (error) {
        this.pending.clear();
        await this.emit({ kind: "snapshot-failed", triggers, error: errorText(error) });
        continue;
      }
      if (this.stopping.signal.aborted || generation !== this.generation) return;
      // Signals while preparing this snapshot are one burst. Once admission
      // starts, retain one fresh request even when its desired values match:
      // a newly started game actor may have an empty configuration database.
      triggers = [...new Set([...triggers, ...this.pending])];
      this.pending.clear();
      this.activeAbort = new AbortController();
      let result: BatchApplyResult;
      try { result = await this.dependencies.apply(commands, this.activeAbort.signal); }
      catch (error) {
        await this.emit({ kind: "attempt-unconfirmed", triggers, error: errorText(error) });
        continue;
      } finally { this.activeAbort = undefined; }
      await this.emit({ kind: "completed", triggers, result });
      // A failed batch has no retry. A later explicit trigger, if present,
      // requests a fresh snapshot/token rather than continuing its sequence.
    }
  }

  private async listen(): Promise<void> {
    let backoff = this.dependencies.retryDelayMs ?? 1_000;
    const maximum = this.dependencies.maximumRetryDelayMs ?? 30_000;
    while (!this.stopping.signal.aborted) {
      const generation = ++this.generation;
      try {
        const listener = await this.dependencies.connect(this.stopping.signal, () => {
          if (generation === this.generation && !this.stopping.signal.aborted) this.request("server-request");
        });
        if (this.stopping.signal.aborted) { await listener.close(); break; }
        this.listener = listener;
        await this.emit({ kind: "connected", generation });
        this.request(this.connectedBefore ? "reconnect" : "startup");
        this.connectedBefore = true;
        backoff = this.dependencies.retryDelayMs ?? 1_000;
        await listener.closed;
      } catch (error) {
        if (!this.stopping.signal.aborted) await this.emit({ kind: "connection-failed", error: errorText(error) });
      } finally {
        this.generation++;
        await this.listener?.close();
        this.listener = undefined;
        this.activeAbort?.abort();
        this.pending.clear();
        await this.drain;
      }
      if (!this.stopping.signal.aborted) {
        await waitForSyncRetry(backoff, this.stopping.signal);
        backoff = Math.min(maximum, backoff * 2);
      }
    }
    await this.emit({ kind: "stopped" });
  }
}
