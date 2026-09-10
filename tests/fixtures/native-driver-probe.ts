/** Manual isolated-server probe. Never reads the UI environment or persistence. */
import { readFileSync, writeFileSync } from "node:fs";
import { Socket } from "node:net";
import { Rcon } from "rcon-client";
import { runAcknowledgedBatch } from "../../src/lib/rcon/batch";
import { prepareProcessingResultReceiver, sendBatchFrameWithProcessingResult } from "../../src/lib/rcon/processing";

const [configPath, outputPath] = process.argv.slice(2);
if (!configPath || !outputPath) throw new Error("Expected explicit isolated config JSON path and evidence output path");
const config = JSON.parse(readFileSync(configPath, "utf8"));
if (config.host !== "127.0.0.1" || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 || typeof config.password !== "string" || !config.password) throw new Error("Probe requires an explicit loopback test configuration");
const evidence: Record<string, unknown> = { realServer: true, host: config.host, port: config.port, scenarios: [], observerResultFrames: [] };
const clients: Rcon[] = [];
function observe(client: Rcon, frames: unknown[]) {
  const socket = (client as unknown as { socket: Socket }).socket;
  let buffered = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    while (buffered.length >= 4 && buffered.length >= buffered.readInt32LE(0) + 4) {
      const size = buffered.readInt32LE(0);
      if (size < 10 || size > 1_048_576) throw new Error("Invalid probe frame");
      const packet = buffered.subarray(0, size + 4); buffered = buffered.subarray(size + 4);
      const body = packet.subarray(12, -2).toString("utf8");
      if (body.startsWith("Custom: EZCONFIG_RESULT ") || body.startsWith("Custom: EZCONFIG_BATCH_RESULT ")) frames.push({ id: packet.readInt32LE(4), type: packet.readInt32LE(8), body, wire_hex: packet.toString("hex") });
    }
  });
}
async function connect(frames: unknown[]) {
  const client = new Rcon({ host: config.host, port: config.port, password: config.password, timeout: 5_000 });
  clients.push(client); client.on("error", () => {});
  await client.connect();
  prepareProcessingResultReceiver(client);
  observe(client, frames);
  const subscription = await client.send("listen custom");
  if (!subscription.includes("Now listening to custom")) throw new Error("Native custom subscription was not enabled");
  return client;
}
async function close(client: Rcon) {
  const socket = (client as unknown as { socket?: Socket }).socket;
  await Promise.race([client.end().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1_000))]);
  socket?.destroy();
}
try {
  await connect(evidence.observerResultFrames as unknown[]);
  for (const scenario of [
    { name: "successful-wipe-and-values", commands: ['string ezconfig WipeDatabases', 'string ezconfig Character Stun {"OutOfStaminaStunDuration":"0.6","UnknownLiveDriver":"1"}'] },
    { name: "malformed-value-fail-stop", commands: ['string ezconfig WipeDatabases', 'string ezconfig Character Stun {"OutOfStaminaStunDuration":"1oops"}', 'string ezconfig Character Stun {"OutOfStaminaStunDuration":"0.7"}'] },
  ]) {
    const frames: unknown[] = [], exchanges: unknown[] = [];
    const client = await connect(frames);
    const result = await runAcknowledgedBatch(scenario.commands, async (frame, options) => {
      const entry: Record<string, unknown> = { frame }; exchanges.push(entry);
      const reply = await sendBatchFrameWithProcessingResult(client, frame, options);
      entry.reply = reply; return reply;
    });
    (evidence.scenarios as unknown[]).push({ ...scenario, result, exchanges, frames });
    if (scenario.name === "successful-wipe-and-values") {
      if (!result.success || result.status !== "complete" || result.commandsSent !== 2 || result.commandsSucceeded !== 2 || result.acceptedValues !== 1 || result.ignoredKeys !== 1 || !result.configurationCleared) throw new Error("Native success result did not match submitted commands");
    } else if (result.success || result.status !== "incomplete" || result.commandsSent !== 2 || result.commandsSucceeded !== 1 || result.acceptedValues !== 0 || !result.configurationCleared || exchanges.length !== 3) throw new Error("Native failure did not stop before the trailing command");
    await close(client);
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
  if ((evidence.observerResultFrames as unknown[]).length) throw new Error("Results leaked to another subscribed ClientId");
  evidence.passed = true;
} catch (error) {
  evidence.passed = false; evidence.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map(close));
  writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify({ passed: evidence.passed, scenarios: (evidence.scenarios as unknown[]).length, observerResults: (evidence.observerResultFrames as unknown[]).length, error: evidence.error }));
}
