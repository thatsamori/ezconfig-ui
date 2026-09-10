import { randomUUID } from "node:crypto";
import { BatchProtocolError, innerConfigCommand, matchesBatchResult, MAX_BATCH_COMMANDS, type BatchFrame, type BatchProcessingResult, type BatchState } from "./batch-protocol";

export type BatchExchange = (frame: BatchFrame, options?: { signal?: AbortSignal; timeoutMs?: number }) => Promise<BatchProcessingResult>;
export interface BatchApplyResult {
  success: boolean;
  status: "complete" | "rejected" | "incomplete" | "unconfirmed";
  /** Attempted data operations, excluding protocol markers. */
  commandsSent: number;
  commandsSucceeded: number;
  acceptedValues: number;
  ignoredKeys: number;
  configurationCleared: boolean;
  serverState?: BatchState;
  batchToken?: string;
  error?: string;
  failedAt?: string;
}

/** Transport-independent fail-stop orchestration with correlated server results. */
export async function runAcknowledgedBatch(
  commands: readonly string[],
  exchange: BatchExchange,
  { signal, requestId = randomUUID }: { signal?: AbortSignal; requestId?: () => string } = {},
): Promise<BatchApplyResult> {
  const progress: BatchApplyResult = { success: false, status: "rejected", commandsSent: 0, commandsSucceeded: 0, acceptedValues: 0, ignoredKeys: 0, configurationCleared: false };
  let phase = "validation";
  let token: string | undefined;
  let terminal = false;
  let payloads: string[] = [];
  const request = async (frame: BatchFrame, requestSignal = signal) => {
    if (requestSignal?.aborted) throw new Error("Apply was cancelled");
    const result = await exchange(frame, { signal: requestSignal });
    if (!matchesBatchResult(frame, result)) throw new BatchProtocolError("Server result did not match this batch request");
    return result;
  };
  const remember = (r: BatchProcessingResult) => {
    progress.commandsSucceeded = r.processed;
    progress.acceptedValues = r.totalAccepted;
    progress.ignoredKeys = r.totalIgnored;
    progress.configurationCleared = r.cleared;
    progress.serverState = r.state;
  };
  const failed = (message: string) => ({ ...progress, success: false, error: message, failedAt: phase });
  try {
    if (commands.length > MAX_BATCH_COMMANDS) throw new BatchProtocolError(`Apply exceeds ${MAX_BATCH_COMMANDS} commands`);
    // Capture the reviewed payloads before awaiting admission; later UI edits
    // cannot change this submission or its announced operation count.
    payloads = commands.map(innerConfigCommand);
    phase = "batch admission";
    const admission = await request({ v: 1, op: "begin", request: requestId(), commands: payloads.length });
    if (!admission.success || admission.state !== "active") return failed(admission.reason || "Server did not admit the apply");
    if (!admission.token || !admission.maxCommands || !admission.idleTimeoutSeconds || admission.processed !== 0 || admission.totalAccepted !== 0 || admission.totalIgnored !== 0 || admission.cleared) {
      throw new BatchProtocolError("Server admission did not establish compatible batch support");
    }
    token = admission.token; progress.batchToken = token; progress.status = "incomplete";
    if (payloads.length > admission.maxCommands) throw new BatchProtocolError("Apply exceeds the server's command limit");
    for (let index = 0; index < payloads.length; index++) {
      phase = `command ${index + 1}`;
      if (signal?.aborted) throw new Error("Apply was cancelled");
      progress.commandsSent++;
      const result = await request({ v: 1, op: "command", request: requestId(), token, seq: index + 1, command: payloads[index] });
      if (!result.success) {
        if (result.processed !== index || result.totalAccepted !== progress.acceptedValues || result.totalIgnored !== progress.ignoredKeys || result.cleared !== progress.configurationCleared) throw new BatchProtocolError("Rejected command returned inconsistent batch totals");
        remember(result); terminal = ["failed", "aborted", "timed_out"].includes(result.state);
        if (terminal) return failed(result.reason || "Server rejected a configuration command");
        throw new Error(result.reason || "Server rejected a batch continuation");
      }
      const expectedClear = progress.configurationCleared || payloads[index].toLowerCase() === "ezconfig wipedatabases";
      if (result.state !== "active" || result.processed !== index + 1 || result.totalAccepted !== progress.acceptedValues + result.accepted || result.totalIgnored !== progress.ignoredKeys + result.ignored || result.cleared !== expectedClear) {
        throw new BatchProtocolError("Server returned inconsistent command processing totals");
      }
      if (payloads[index].toLowerCase() === "ezconfig wipedatabases" && (!result.cleared || result.accepted !== 0 || result.ignored !== 0)) throw new BatchProtocolError("Server did not confirm the requested wipe");
      remember(result);
    }
    phase = "batch completion";
    const result = await request({ v: 1, op: "end", request: requestId(), token, seq: payloads.length + 1 });
    if (!result.success || result.state !== "complete" || result.processed !== payloads.length || result.totalAccepted !== progress.acceptedValues || result.totalIgnored !== progress.ignoredKeys || result.cleared !== progress.configurationCleared) {
      throw new BatchProtocolError(result.reason || "Server did not confirm complete processing");
    }
    remember(result); terminal = true;
    return { ...progress, success: true, status: "complete" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apply processing was not confirmed";
    if (token && !terminal) {
      progress.status = "unconfirmed";
      try {
        // Never reuse an aborted request signal for cleanup. One bounded abort,
        // no data replay. A disconnected/unusable session falls back to the
        // server's inactivity timeout and retains only confirmed progress here.
        const abort: BatchFrame = { v: 1, op: "abort", request: requestId(), token, reason: signal?.aborted ? "client_abort" : "processing_unconfirmed" };
        const result = await exchange(abort, { timeoutMs: 1_500 });
        const unchangedCount = result.processed === progress.commandsSucceeded;
        const expectedClear = payloads.slice(0, result.processed).some((command) => command.toLowerCase() === "ezconfig wipedatabases");
        if (!matchesBatchResult(abort, result) || result.state === "active" || result.state === "rejected" || result.processed < progress.commandsSucceeded || result.processed > progress.commandsSent || result.totalAccepted < progress.acceptedValues || result.totalIgnored < progress.ignoredKeys || result.cleared !== expectedClear || (unchangedCount && (result.totalAccepted !== progress.acceptedValues || result.totalIgnored !== progress.ignoredKeys))) throw new BatchProtocolError("Abort did not confirm a terminal batch state");
        if (result.state === "complete" && (phase !== "batch completion" || result.processed !== payloads.length)) throw new BatchProtocolError("Completion was reported before all submitted commands and end were attempted");
        remember(result);
        // Late terminal information can improve known progress but cannot turn
        // an interrupted attempt into an automatic successful apply/metadata.
        progress.status = result.state === "complete" ? "unconfirmed" : "incomplete";
      } catch { /* Uncertain outcome is retained; do not retry. */ }
    }
    return failed(message);
  }
}
