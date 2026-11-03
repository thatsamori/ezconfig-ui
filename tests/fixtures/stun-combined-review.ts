/**
 * Combined stun, Chftp and disarm keys through the editor and Apply, on the
 * feature review harness. Each delivered batch is also run through the real
 * batch sender against a controlled result exchange, for the mod's replay
 * evidence; controlled outcomes only, not native parser proof.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runAcknowledgedBatch } from '../../src/lib/rcon/batch';
import { BATCH_PROTOCOL, encodeBatchFrame, type BatchFrame, type BatchProcessingResult } from '../../src/lib/rcon/batch-protocol';
import { categoryCommands, categoryEntries, featureReview, WIPE } from './feature-review-harness';

// Total derived from the published string schema, so adding a key does not require editing this fixture.
const publishedCharacterKeyCount = (await readFile(join(import.meta.dir, '..', '..', 'string-schemas', 'characterConfigSchema.txt'), 'utf8')).trim().split(/\s+/).length;
const required = ['FreeStun', 'FreeStunDuration', 'OutOfStaminaStunDuration'];
let counter = 0;
const captures: { mode: string; commands: readonly string[]; frames: BatchFrame[]; wire: string[]; result?: unknown }[] = [];

async function exchange(mode: string, commands: readonly string[]) {
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
  }, { requestId: () => `combined-request-${++counter}` });
  capture.result = result;
  return result;
}

await featureReview('stun-combined', async ({ set, reset, saved, apply }) => {
  const { CHARACTER_CONFIG_OPTIONS } = await import('../../src/lib/config/characterConfigSchema');
  const keys = Object.values(CHARACTER_CONFIG_OPTIONS).flat().map((entry) => entry.configKey);
  assert(required.every((key) => keys.includes(key)), 'Ticket03 must register all three new keys before this integration fixture runs');
  assert.equal(keys.length, publishedCharacterKeyCount);
  const setAll = async (category: string, values: Record<string, number | boolean>) => {
    for (const [key, value] of Object.entries(values)) set('Character', category, key, value);
    for (const [key, value] of Object.entries(values)) assert.equal(await saved('Character', category, key), value);
  };
  // Apply everything, then check the delivered batch completes its controlled exchange.
  const applied = async (mode: string, accepted: number) => {
    const batch = await apply(mode);
    const result = await exchange(mode, batch);
    assert.equal(result.success, true); assert.equal(result.acceptedValues, accepted); assert.equal(result.configurationCleared, true);
    const { frames } = captures.at(-1)!;
    assert.equal(frames[0].op, 'begin'); assert.equal(frames.at(-1)!.op, 'end');
    assert.equal(frames.filter((frame) => frame.op === 'command').length, batch.length);
    return batch;
  };
  const stun = (batch: string[]) => categoryEntries(batch, 'Character', 'Stun');

  const initialValues = {
    Chftp: { ChftpStun: true, ChftpStunDuration: 1.4, ChftpStunDisarms: true },
    Misc: { DisarmPickupDelay: true, DisarmPickupDelayDuration: .2 },
    Stun: { FreeStun: true, FreeStunDuration: .35, OutOfStaminaStunDuration: .7 },
  };
  const initialPersisted: Record<string, unknown> = {};
  for (const [category, values] of Object.entries(initialValues)) {
    await setAll(category, values);
    initialPersisted[`Character/${category}`] = values;
  }
  const initial = await applied('full-combined', 8);
  assert.equal(categoryCommands(initial).length, 3);
  assert.deepEqual(stun(initial), { FreeStun: 'True', FreeStunDuration: '0.35', OutOfStaminaStunDuration: '0.7' });
  assert.deepEqual(categoryEntries(initial, 'Character', 'Chftp'), { ChftpStun: 'True', ChftpStunDuration: '1.40', ChftpStunDisarms: 'True' });
  assert.deepEqual(categoryEntries(initial, 'Character', 'Misc'), { DisarmPickupDelay: 'True', DisarmPickupDelayDuration: '0.20' });
  assert.deepEqual(await applied('unchanged-full', 8), initial);

  // Distinct new durations replace the selected-only stage the mod used to replay.
  await setAll('Stun', { FreeStunDuration: 1.2, OutOfStaminaStunDuration: .25 });
  await setAll('Chftp', { ChftpStunDuration: 2.3 });
  const distinct = await applied('distinct-durations', 8);
  assert.deepEqual(stun(distinct), { FreeStun: 'True', FreeStunDuration: '1.2', OutOfStaminaStunDuration: '0.25' });
  assert.equal(categoryEntries(distinct, 'Character', 'Chftp')!.ChftpStunDuration, '2.30');
  await setAll('Stun', { FreeStunDuration: 0, OutOfStaminaStunDuration: 0 });
  assert.deepEqual(stun(await applied('zero-new-durations', 8)), { FreeStun: 'True', FreeStunDuration: '0', OutOfStaminaStunDuration: '0' });
  await setAll('Stun', { FreeStun: false, FreeStunDuration: .6, OutOfStaminaStunDuration: .7 });
  assert.deepEqual(stun(await applied('disabled-parameter-retained', 8)), { FreeStun: 'False', FreeStunDuration: '0.6', OutOfStaminaStunDuration: '0.7' });

  reset('Character', 'Stun', 'FreeStunDuration');
  const replacement = await applied('replacement-removes-one-key', 7);
  assert(!replacement.some((command) => command.includes('"FreeStunDuration"')));
  assert.deepEqual(stun(replacement), { FreeStun: 'False', OutOfStaminaStunDuration: '0.7' });
  await setAll('Stun', { FreeStun: true, FreeStunDuration: .35 });
  await applied('reapply-combined', 8);

  // Not from Apply: hand-written batches for the mod's replay, an unknown key
  // beside a known one, then a controlled failure after the wipe has run.
  const mixed = 'string ezconfig Character Stun {"OutOfStaminaStunDuration":"0.7","UnknownCombinedProbe":"1"}';
  const mixedResult = await exchange('mixed-known-unknown', [mixed]);
  assert.equal(mixedResult.success, true); assert.equal(mixedResult.acceptedValues, 1);
  assert.equal(mixedResult.ignoredKeys, 1); assert.equal(mixedResult.configurationCleared, false);
  const invalid = 'string ezconfig Character Stun {"OutOfStaminaStunDuration":"0.9","FreeStunDuration":"-1"}';
  const failure = await exchange('mixed-late-failure', [WIPE, mixed, invalid, 'string ezconfig Character Stun {"FreeStun":"False"}']);
  assert.equal(failure.success, false); assert.equal(failure.status, 'incomplete');
  assert.equal(failure.acceptedValues, 1); assert.equal(failure.ignoredKeys, 1);
  assert.equal(failure.commandsSent, 3); assert.equal(failure.commandsSucceeded, 2); assert.equal(failure.configurationCleared, true);
  assert.deepEqual(captures.at(-1)!.frames.map((frame) => frame.op), ['begin', 'command', 'command', 'command']);

  for (const [category, values] of Object.entries(initialValues)) {
    for (const key of Object.keys(values)) reset('Character', category, key);
  }
  assert.deepEqual(await applied('empty-replacement-wipe-only', 0), [WIPE]);
  if (process.env.EZ_STUN_COMBINED_CAPTURE_PATH) await writeFile(process.env.EZ_STUN_COMBINED_CAPTURE_PATH, JSON.stringify({
    boundary: 'Feature review harness (isolated editor store, persistence and Apply everything after a wipe); each delivered batch run through the real batch sender against a controlled result exchange. Native replay is separate.',
    initialPersisted, captures,
  }, null, 2));
});
console.log('PASS: combined stun keys through the editor and Apply; full, unchanged, distinct, zero, disabled parameter, replacement/removal, unknowns and incomplete mixed batch');
