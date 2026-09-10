import { Rcon } from "rcon-client";
import { env } from "@/lib/env";
import type { Socket } from "node:net";
import { prepareProcessingResultReceiver, sendBatchFrameWithProcessingResult } from "./processing";
import { runAcknowledgedBatch, type BatchApplyResult } from "./batch";

export interface RconConfig {
  host: string;
  port: number;
  password: string;
}

/**
 * Execute a batch of RCON commands sequentially using a single connection
 * @param commands Array of command strings to execute
 * @returns Array of responses from each command
 */
export async function executeBatchCommands(
  commands: string[],
): Promise<string[]> {
  const config: RconConfig = {
    host: env.rcon.host,
    port: env.rcon.port,
    password: env.rcon.password,
  };

  const rcon = await Rcon.connect(config);
  const responses: string[] = [];

  try {
    // Execute commands sequentially
    for (const command of commands) {
      const response = await rcon.send(command);
      console.log("Successfully executed command:", command);
      responses.push(response);
      // Small delay between commands to avoid overwhelming the server
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    // End connection with timeout to prevent hanging
    await Promise.race([
      rcon.end(),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
  }

  return responses;
}

/**
 * Execute a single RCON command
 * @param command Command string to execute
 * @returns Response from the server
 */
export async function executeCommand(command: string): Promise<string> {
  const config: RconConfig = {
    host: env.rcon.host,
    port: env.rcon.port,
    password: env.rcon.password,
  };

  const rcon = await Rcon.connect(config);

  try {
    return await rcon.send(command);
  } finally {
    // End connection with timeout to prevent hanging
    await Promise.race([
      rcon.end(),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
  }
}

/**
 * Explicit acknowledged apply path. Incompatible servers fail admission before wipe.
 * Generic executeCommand/executeBatchCommands remain available independently.
 */
export async function executeAcknowledgedBatch(
  commands: readonly string[],
  { signal }: { signal?: AbortSignal } = {},
): Promise<BatchApplyResult> {
  return executeAcknowledgedBatchAt(env.rcon, commands, { signal });
}

/** Explicit server configuration for the managed responder and isolated tests. */
export async function executeAcknowledgedBatchAt(
  config: RconConfig,
  commands: readonly string[],
  { signal }: { signal?: AbortSignal } = {},
): Promise<BatchApplyResult> {
  const rcon = new Rcon({ ...config, timeout: 5_000 });
  // Install before authentication: the library forwards socket errors to its
  // public EventEmitter, which otherwise throws without a listener.
  rcon.on("error", () => {});
  let phase = "RCON connection";
  try {
    if (signal?.aborted) throw new Error("Apply was cancelled");
    await rcon.connect();
    prepareProcessingResultReceiver(rcon);
    if (signal?.aborted) throw new Error("Apply was cancelled");
    phase = "processing-result subscription";
    // Native subscription command: generic output is not considered capability
    // proof. The following matching admission is required before any mutation.
    await rcon.send("listen custom");
    return await runAcknowledgedBatch(commands, (frame, options) => sendBatchFrameWithProcessingResult(rcon, frame, options), { signal });
  } catch (error) {
    return { success: false, status: "rejected", commandsSent: 0, commandsSucceeded: 0, acceptedValues: 0, ignoredKeys: 0, configurationCleared: false, error: error instanceof Error ? error.message : "Could not establish acknowledged processing", failedAt: phase };
  } finally {
    const socket = (rcon as unknown as { socket?: Socket }).socket;
    await Promise.race([rcon.end().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 1_000))]);
    // This function owns the connection. End's bounded wait must not leave a
    // half-closed socket/receiver alive if the remote endpoint stops responding.
    if (socket && !socket.destroyed) socket.destroy();
  }
}
