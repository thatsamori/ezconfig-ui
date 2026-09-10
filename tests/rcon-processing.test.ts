import { describe, expect, test } from "bun:test";
import { createServer, type Socket } from "node:net";
import { Rcon } from "rcon-client";
import { observeRconPayloads, parseProcessingResult, prepareProcessingResultReceiver, ProcessingResultError, sendBatchFrameWithProcessingResult, sendWithProcessingResult } from "../src/lib/rcon/processing";
import capturedResults from "./fixtures/server-processing-results.json";
import nativePackets from "./fixtures/native-processing-packets.json";
import { BATCH_PROTOCOL, BATCH_RESULT_PREFIX, parseBatchProcessingResult, type BatchFrame, type BatchProcessingResult } from "../src/lib/rcon/batch-protocol";

const command = 'string ezconfig Character Combat {"StaminaCostModifier":"1.2"}';
const outcome = { protocol: "EZConfig/1" as const, command: command.slice(7), success: true, accepted: 1, ignored: 0, error: "" };
function packet(id: number, type: number, payload: string) {
  const text = Buffer.from(payload);
  const b = Buffer.alloc(text.length + 14);
  b.writeInt32LE(text.length + 10, 0); b.writeInt32LE(id, 4); b.writeInt32LE(type, 8); text.copy(b, 12);
  return b;
}
async function fixture(run: (client: Rcon, received: string[], reply: (value: unknown, split?: boolean) => void, close: () => void) => Promise<void>) {
  const sockets: Socket[] = [];
  const received: string[] = [];
  const server = createServer((socket) => {
    sockets.push(socket);
    let data = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      data = Buffer.concat([data, chunk]);
      while (data.length >= 4 && data.length >= data.readInt32LE(0) + 4) {
        const length = data.readInt32LE(0); const p = data.subarray(4, length + 4); data = data.subarray(length + 4);
        const id = p.readInt32LE(0), type = p.readInt32LE(4), text = p.subarray(8, -2).toString();
        if (type === 3) socket.write(packet(id, 2, ""));
        else { received.push(text); socket.write(packet(id, 0, "Generic transport output")); }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No fixture address");
  const client = await Rcon.connect({ host: "127.0.0.1", port: address.port, password: "fixture", timeout: 100 });
  prepareProcessingResultReceiver(client);
  try {
    await run(client, received, (value, split = false) => {
      const b = packet(-1, 0, "EZCONFIG_RESULT " + JSON.stringify(value));
      if (split) { sockets[0].write(b.subarray(0, 9)); setTimeout(() => sockets[0].write(b.subarray(9)), 5); }
      else sockets[0].write(b);
    }, () => sockets[0].destroy());
  } finally {
    for (const socket of sockets) socket.destroy();
    await client.end().catch(() => undefined); // The disconnect test already closed it.
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("processing results (controlled transport and captured native packet regression)", () => {
  test("persistent payload observation closes an unusable decoder instead of remaining silently deaf", async () => {
    await fixture(async (client) => {
      const seen: string[] = [];
      prepareProcessingResultReceiver(client);
      observeRconPayloads(client, (payload) => { seen.push(payload); });
      const socket = (client as unknown as { socket: Socket }).socket;
      socket.emit("data", packet(54328, 0, "Custom: unrelated server message"));
      socket.emit("data", packet(54328, 0, "Custom: ezconfig requestupdate"));
      expect(socket.destroyed).toBe(false); expect(seen.length).toBe(2);
      const ended = new Promise<void>((resolve) => client.once("end", resolve));
      socket.emit("data", packet(54328, 0, "Custom: EZCONFIG_RESULT {"));
      await ended;
      expect(socket.destroyed).toBe(true);
    });
  });
  test("accepts exactly the native Custom envelope, without searching unrelated broadcasts", () => {
    const unrelated = 'Custom: unrelated announcement EZCONFIG_RESULT ' + JSON.stringify(outcome);
    expect(parseProcessingResult(unrelated)).toBeNull();
    expect(parseBatchProcessingResult(unrelated)).toBeNull();
    for (const exchange of nativePackets.exchanges) {
      for (const frame of exchange.frames) {
        const parsed = parseProcessingResult(frame.body) ?? parseBatchProcessingResult(frame.body);
        if (!frame.body.startsWith("Custom: EZCONFIG_")) { expect(parsed).toBeNull(); continue; }
        expect(parsed).not.toBeNull();
        expect(parseProcessingResult("Chat: " + frame.body)).toBeNull();
        expect(parseBatchProcessingResult("Chat: " + frame.body)).toBeNull();
        expect(parseProcessingResult("Custom: " + frame.body)).toBeNull();
        expect(parseBatchProcessingResult("Custom: " + frame.body)).toBeNull();
      }
    }
  });
  test("receives all seven captured native packets, fragmented alongside generic responses", async () => {
    await fixture(async (client) => {
      const socket = (client as unknown as { socket: Socket }).socket;
      for (const exchange of nativePackets.exchanges) {
        const custom = exchange.frames.find((frame) => frame.body.startsWith("Custom: EZCONFIG_"))!;
        const expected = JSON.parse(custom.body.slice(custom.body.indexOf("{") ));
        let pending: Promise<unknown>;
        if (exchange.command.startsWith("string ezconfig batch ")) {
          const wire = JSON.parse(exchange.command.slice("string ezconfig batch ".length));
          const frame = { ...wire, v: 1, ...("seq" in wire ? { seq: Number(wire.seq) } : {}), ...("commands" in wire ? { commands: Number(wire.commands) } : {}) } as BatchFrame;
          pending = sendBatchFrameWithProcessingResult(client, frame, { timeoutMs: 300 });
        } else pending = sendWithProcessingResult(client, exchange.command, { timeoutMs: 300 });
        const observed = pending.catch((error: ProcessingResultError) => error.result ?? error);
        // Preserve the exact captured IDs, envelope, JSON and terminators.
        const bytes = Buffer.concat(exchange.frames.map((frame) => Buffer.from(frame.wire_hex, "hex")));
        socket.emit("data", bytes.subarray(0, 3));
        socket.emit("data", bytes.subarray(3, 19));
        socket.emit("data", bytes.subarray(19));
        expect(await observed).toEqual(expected);
      }
    });
  });
  test("decodes results actually constructed by the mod's Blueprint helper", () => {
    // Captured actor result strings, not a claim of captured native TCP packets.
    for (const captured of capturedResults) {
      const result = parseProcessingResult(captured.encodedResult);
      expect(result).toMatchObject({ command: captured.command, success: captured.success, accepted: captured.accepted, ignored: captured.ignored });
    }
  });
  test("generic output never proves processing; strict counts reject incompatible outcomes", () => {
    expect(parseProcessingResult("Generic transport output")).toBeNull();
    expect(parseProcessingResult("EZCONFIG_RESULT " + JSON.stringify(outcome))).toEqual(outcome);
    for (const bad of [{ ...outcome, accepted: -1 }, { ...outcome, success: false }, { ...outcome, protocol: "EZConfig/2" }, { ...outcome, ignored: 0.5 }]) {
      expect(() => parseProcessingResult("EZCONFIG_RESULT " + JSON.stringify(bad))).toThrow(ProcessingResultError);
    }
  });
  test("real rcon-client ignores unsolicited IDs, adapter receives fragmented matching result", async () => {
    await fixture(async (client, received, reply) => {
      let done = false;
      const p = sendWithProcessingResult(client, command, { timeoutMs: 300 }).then((r) => { done = true; return r; });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(received).toEqual([command]); expect(done).toBe(false);
      reply({ ...outcome, command: "ezconfig another-command" });
      await new Promise((resolve) => setTimeout(resolve, 10)); expect(done).toBe(false);
      reply(outcome, true); expect(await p).toEqual(outcome);
      expect(await client.send("status")).toBe("Generic transport output");
    });
  });
  test("rejection remains distinct from a missing outcome", async () => {
    await fixture(async (client, _received, reply) => {
      const p = sendWithProcessingResult(client, command, { timeoutMs: 150 }).catch((e) => e);
      reply({ ...outcome, success: false, accepted: 0, error: "Invalid numeric representation" });
      expect((await p).kind).toBe("rejected");
      const missing = await sendWithProcessingResult(client, command, { timeoutMs: 25 }).catch((e) => e);
      expect(missing.kind).toBe("missing");
    });
  });
  test("disconnect is uncertain and overlap is rejected before another send", async () => {
    await fixture(async (client, received, _reply, close) => {
      const first = sendWithProcessingResult(client, command, { timeoutMs: 150 }).catch((e) => e);
      const second = await sendWithProcessingResult(client, command).catch((e) => e);
      expect(second.kind).toBe("busy");
      await new Promise((resolve) => setTimeout(resolve, 10)); expect(received).toEqual([command]);
      close(); expect((await first).kind).toBe("transport");
    });
  });
  test("unsupported observation fails before any command", async () => {
    const client = new Rcon({ host: "127.0.0.1", port: 1, password: "unused" });
    expect((await sendWithProcessingResult(client, command).catch((e) => e)).kind).toBe("capability");
  });
  test("coalesced unrelated/result packets work and late replies cannot revive a timed-out session", async () => {
    await fixture(async (client, received) => {
      const socket = (client as unknown as { socket: Socket }).socket;
      const baseline = socket.listenerCount("data");
      const p = sendWithProcessingResult(client, command, { timeoutMs: 150 });
      // Deliver coalesced native-format packet fixtures to the real library
      // stream observers. Generic request handling remains installed.
      socket.emit("data", Buffer.concat([packet(-1, 0, "Unrelated broadcast"), packet(-1, 0, "EZCONFIG_RESULT " + JSON.stringify(outcome))]));
      expect(await p).toEqual(outcome);
      expect(socket.listenerCount("data")).toBe(baseline);
      const timedOut = await sendWithProcessingResult(client, command, { timeoutMs: 25 }).catch((e) => e);
      expect(timedOut.kind).toBe("missing");
      expect(socket.listenerCount("data")).toBe(baseline);
      socket.emit("data", packet(-1, 0, "EZCONFIG_RESULT " + JSON.stringify(outcome)));
      expect((await sendWithProcessingResult(client, command).catch((e) => e)).kind).toBe("capability");
      expect(received.length).toBe(2);
    });
  });
  test("framing survives a broadcast split across command completion and the next command", async () => {
    await fixture(async (client) => {
      const socket = (client as unknown as { socket: Socket }).socket;
      const broadcast = packet(-1, 0, "Unrelated broadcast across commands");
      const first = sendWithProcessingResult(client, command, { timeoutMs: 150 });
      socket.emit("data", Buffer.concat([packet(-1, 0, "EZCONFIG_RESULT " + JSON.stringify(outcome)), broadcast.subarray(0, 8)]));
      expect(await first).toEqual(outcome);
      const second = sendWithProcessingResult(client, command, { timeoutMs: 150 });
      socket.emit("data", Buffer.concat([broadcast.subarray(8), packet(-1, 0, "EZCONFIG_RESULT " + JSON.stringify(outcome))]));
      expect(await second).toEqual(outcome);
    });
  });
  test("library-forwarded socket error rejects without an uncaught EventEmitter error", async () => {
    await fixture(async (client) => {
      const result = sendWithProcessingResult(client, command, { timeoutMs: 150 }).catch((e) => e);
      const socket = (client as unknown as { socket: Socket }).socket;
      expect(() => socket.emit("error", new Error("fixture transport failure"))).not.toThrow();
      expect((await result).kind).toBe("transport");
    });
  });
  test("tagged timeout can abort on the same stream while a late prior reply is ignored", async () => {
    await fixture(async (client) => {
      const socket = (client as unknown as { socket: Socket }).socket;
      const frame: BatchFrame = { v: 1, op: "command", request: "command-request", token: "batch-token", seq: 1, command: command.slice(7) };
      const late: BatchProcessingResult = { protocol: BATCH_PROTOCOL, request: frame.request, op: "command", token: frame.token, seq: 1, success: true, accepted: 1, ignored: 0, totalAccepted: 1, totalIgnored: 0, processed: 1, cleared: false, state: "active", reason: "" };
      expect((await sendBatchFrameWithProcessingResult(client, frame, { timeoutMs: 25 }).catch((e) => e)).kind).toBe("missing");
      const abort: BatchFrame = { v: 1, op: "abort", request: "abort-request", token: frame.token, reason: "processing_unconfirmed" };
      const pending = sendBatchFrameWithProcessingResult(client, abort, { timeoutMs: 150 });
      socket.emit("data", packet(-1, 0, BATCH_RESULT_PREFIX + JSON.stringify(late)));
      const terminal: BatchProcessingResult = { ...late, request: abort.request, op: "abort", seq: 0, success: false, accepted: 0, state: "aborted" };
      socket.emit("data", packet(-1, 0, BATCH_RESULT_PREFIX + JSON.stringify(terminal)));
      expect(await pending).toEqual(terminal);
    });
  });
  test("request cancellation removes its waiter without poisoning tagged abort correlation", async () => {
    await fixture(async (client) => {
      const controller = new AbortController();
      const frame: BatchFrame = { v: 1, op: "begin", request: "begin-request", commands: 0 };
      const result = sendBatchFrameWithProcessingResult(client, frame, { signal: controller.signal }).catch((e) => e);
      controller.abort(); expect((await result).kind).toBe("aborted");
      const other = sendBatchFrameWithProcessingResult(client, { ...frame, request: "different-request" }, { timeoutMs: 25 }).catch((e) => e);
      expect((await other).kind).toBe("missing");
    });
  });
});
