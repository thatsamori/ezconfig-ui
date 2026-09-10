/** Combined real UI persistence/review/API/sender capture; controlled outcomes only. */
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { runAcknowledgedBatch } from '../../src/lib/rcon/batch';
import { BATCH_PROTOCOL, encodeBatchFrame, type BatchFrame, type BatchProcessingResult } from '../../src/lib/rcon/batch-protocol';

// This standalone child fixture imports no instrumentation/bootstrap and mocks
// the service before the API/store imports. No configured RCON connection opens.
process.env.RCON_AUTO_SYNC_ENABLED = 'false';
const parent = resolve(tmpdir());
const root = await mkdtemp(join(parent, 'ezconfig-stun-combined-'));
process.env.DATABASES_PATH = root;
const originalFetch = globalThis.fetch;
const required = ['FreeStun', 'FreeStunDuration', 'OutOfStaminaStunDuration'];
let mode = 'full-combined', counter = 0;
const captures: { mode: string; commands: readonly string[]; frames: BatchFrame[]; wire: string[]; result?: unknown }[] = [];
mock.module('../../src/lib/rcon/service', () => ({
  executeAcknowledgedBatch: async (commands: readonly string[], options: { signal?: AbortSignal } = {}) => {
    const capture: (typeof captures)[number] = { mode, commands: [...commands], frames: [], wire: [] };
    captures.push(capture);
    let processed = 0, accepted = 0, ignored = 0, cleared = false;
    let state: BatchProcessingResult['state'] = 'active';
    const token = `combined-fixture-${++counter}`;
    const result = await runAcknowledgedBatch(commands, async (frame) => {
      capture.frames.push(frame); capture.wire.push(encodeBatchFrame(frame));
      const reply = (extra: Partial<BatchProcessingResult> = {}): BatchProcessingResult => ({
        protocol: BATCH_PROTOCOL, request: frame.request, op: frame.op, token,
        seq: 'seq' in frame ? frame.seq : 0, success: state === 'active' || state === 'complete',
        accepted: 0, ignored: 0, totalAccepted: accepted, totalIgnored: ignored,
        processed, cleared, state, reason: '', ...extra,
      });
      if (frame.op === 'begin') return reply({ maxCommands: 2048, idleTimeoutSeconds: 30 });
      if (frame.op === 'command') {
        // Controlled rejected outcome, not a substitute for native parser proof.
        if (mode === 'mixed-late-failure' && frame.seq === 3) {
          state = 'failed'; return reply({ reason: 'Controlled invalid recognized duration' });
        }
        const wipe = frame.command === 'ezconfig WipeDatabases';
        const keys = wipe ? [] : Object.keys(JSON.parse(frame.command.slice(frame.command.indexOf('{'))));
        const unknown = keys.filter((key) => key === 'UnknownCombinedProbe').length;
        const count = keys.length - unknown;
        processed++; accepted += count; ignored += unknown; cleared ||= wipe;
        return reply({ accepted: count, ignored: unknown });
      }
      state = frame.op === 'end' ? 'complete' : 'aborted';
      return reply();
    }, { ...options, requestId: () => `combined-request-${++counter}` });
    capture.result = result;
    return result;
  },
}));

try {
  const { CHARACTER_CONFIG_OPTIONS } = await import('../../src/lib/config/characterConfigSchema');
  const keys = Object.values(CHARACTER_CONFIG_OPTIONS).flat().map((entry) => entry.configKey);
  assert(required.every((key) => keys.includes(key)), 'Ticket03 must register all three new keys before this integration fixture runs');
  assert.equal(keys.length, 174);
  const { POST: save, GET: read } = await import('../../src/app/api/config/[...path]/route');
  const { GET: preview } = await import('../../src/app/api/apply/preview/route');
  const { POST: apply } = await import('../../src/app/api/apply/route');
  const { reviewRows, selectedReviewCommands } = await import('../../src/components/console/model');
  const { useConfigStore, flushConfigWrites } = await import('../../src/lib/store/configStore');
  const { readApplyRecord } = await import('../../src/lib/database/applyRecord');
  globalThis.fetch = (async (url: string, init: RequestInit) => save(new Request('http://localhost' + url, init) as never,
    { params: Promise.resolve({ path: url.slice('/api/config/'.length).split('/') }) })) as unknown as typeof fetch;
  const store = useConfigStore.getState();
  const set = async (category: string, values: Record<string, number | boolean>) => {
    for (const [key, value] of Object.entries(values)) store.setValue('Character', category, key, value);
    await flushConfigWrites();
    const response = await read(new Request('http://localhost/api') as never, { params: Promise.resolve({ path: ['Character', category] }) });
    assert.equal(response.status, 200);
    const persisted = (await response.json()).data;
    for (const [key, value] of Object.entries(values)) assert.equal(persisted[key], value);
  };
  const review = async () => {
    const response = await preview(); assert.equal(response.status, 200);
    const data = await response.json(); return { commands: data.commands as string[], rows: reviewRows(data.commands) };
  };
  const submit = async (name: string, body: unknown, accepted: number, cleared: boolean) => {
    mode = name;
    const response = await apply(new Request('http://localhost/api/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    const result = await response.json();
    assert.equal(response.status, 200); assert.equal(result.success, true);
    assert.equal(result.acceptedValues, accepted); assert.equal(result.configurationCleared, cleared);
    const capture = captures.at(-1)!;
    assert.equal(capture.frames[0].op, 'begin'); assert.equal(capture.frames.at(-1)!.op, 'end');
    assert.equal(capture.frames.filter((frame) => frame.op === 'command').length, capture.commands.length);
    return result;
  };

  await set('Stun', { FreeStun: true, FreeStunDuration: .35, OutOfStaminaStunDuration: .7 });
  await set('Chftp', { ChftpStun: true, ChftpStunDuration: 1.4, ChftpStunDisarms: true });
  await set('Misc', { DisarmPickupDelay: true, DisarmPickupDelayDuration: .2 });
  const initialPersisted: Record<string, unknown> = {};
  for (const category of ['Chftp', 'Misc', 'Stun']) {
    initialPersisted[`Character/${category}`] = JSON.parse(await readFile(join(root, 'Character', `${category}.json`), 'utf8'));
  }
  const initial = await review(); assert.equal(initial.rows.length, 8);
  assert(required.every((key) => initial.rows.some((row) => row.key === key)));
  await submit('full-combined', {}, 8, true);
  assert.deepEqual(captures.at(-1)!.commands, ['string ezconfig WipeDatabases', ...initial.commands]);
  await submit('unchanged-full', {}, 8, true);
  assert.deepEqual(captures.at(-1)!.commands, captures.at(-2)!.commands);

  await set('Stun', { FreeStunDuration: 1.2, OutOfStaminaStunDuration: .25 });
  await set('Chftp', { ChftpStunDuration: 2.3 });
  const selectedView = await review();
  const selected = selectedReviewCommands(selectedView.rows, new Set(selectedView.rows.filter((row) => ['FreeStunDuration', 'OutOfStaminaStunDuration', 'ChftpStunDuration'].includes(row.key)).map((row) => row.id)));
  await submit('selected-distinct-durations', { commands: selected, wipeDatabase: false }, 3, false);
  assert(!captures.at(-1)!.commands.some((command) => command.includes('WipeDatabases') || command.includes('"FreeStun":')));
  await set('Stun', { FreeStunDuration: 0, OutOfStaminaStunDuration: 0 });
  await submit('zero-new-durations', {}, 8, true);
  assert(captures.at(-1)!.commands.some((command) => command.includes('"FreeStunDuration":"0"') && command.includes('"OutOfStaminaStunDuration":"0"')));
  await set('Stun', { FreeStun: false, FreeStunDuration: .6, OutOfStaminaStunDuration: .7 });
  await submit('disabled-parameter-retained', {}, 8, true);
  assert(captures.at(-1)!.commands.some((command) => command.includes('"FreeStun":"False"') && command.includes('"FreeStunDuration":"0.6"')));

  store.removeValue('Character', 'Stun', 'FreeStunDuration'); await flushConfigWrites();
  await submit('replacement-removes-one-key', {}, 7, true);
  assert(!captures.at(-1)!.commands.some((command) => command.includes('"FreeStunDuration"')));
  await set('Stun', { FreeStun: true, FreeStunDuration: .35 });
  await submit('reapply-combined', {}, 8, true);

  const mixed = 'string ezconfig Character Stun {"OutOfStaminaStunDuration":"0.7","UnknownCombinedProbe":"1"}';
  const mixedResult = await submit('mixed-known-unknown', { commands: [mixed], wipeDatabase: false }, 1, false);
  assert.equal(mixedResult.ignoredKeys, 1);
  const lastRecord = await readFile(join(root, '.last-apply.json'), 'utf8');
  mode = 'mixed-late-failure';
  const invalid = 'string ezconfig Character Stun {"OutOfStaminaStunDuration":"0.9","FreeStunDuration":"-1"}';
  const response = await apply(new Request('http://localhost/api/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wipeDatabase: true, commands: [mixed, invalid, 'string ezconfig Character Stun {"FreeStun":"False"}'] }) }));
  const failure = await response.json();
  assert.equal(response.status, 502); assert.equal(failure.status, 'incomplete');
  assert.equal(failure.acceptedValues, 1); assert.equal(failure.ignoredKeys, 1);
  assert.equal(failure.commandsSent, 3); assert.equal(failure.commandsSucceeded, 2); assert.equal(failure.configurationCleared, true);
  assert.deepEqual(captures.at(-1)!.frames.map((frame) => frame.op), ['begin', 'command', 'command', 'command']);
  assert.equal(await readFile(join(root, '.last-apply.json'), 'utf8'), lastRecord);

  for (const row of (await review()).rows) store.removeValue('Character', row.category, row.key);
  await flushConfigWrites(); assert.equal((await review()).rows.length, 0);
  await submit('empty-replacement-wipe-only', {}, 0, true);
  assert.deepEqual(captures.at(-1)!.commands, ['string ezconfig WipeDatabases']);
  assert.equal((await readApplyRecord())!.values, 0);
  if (process.env.EZ_STUN_COMBINED_CAPTURE_PATH) await writeFile(process.env.EZ_STUN_COMBINED_CAPTURE_PATH, JSON.stringify({
    boundary: 'Real isolated UI store/persistence/review/API/batch driver; controlled result exchange. Native replay is separate.',
    initialPersisted, initialRows: initial.rows, captures,
  }, null, 2));
  console.log('PASS: combined174-key UI capture; full/selected, unchanged, zero, disabled parameter, replacement/removal, unknowns and incomplete mixed batch');
} finally {
  globalThis.fetch = originalFetch;
  const target = resolve(root);
  assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith('ezconfig-stun-combined-'));
  await rm(target, { recursive: true, force: true });
}
