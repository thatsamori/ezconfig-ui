import { successfulProcessingFixture } from './acknowledged-transport';
// Final integrated Movement boundary: real store/handlers, temporary persistence, mocked RCON only.
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const parent = resolve(tmpdir());
const root = await mkdtemp(join(parent, 'ezconfig-movement-combined-'));
process.env.DATABASES_PATH = root;
const sent: string[][] = [];
const originalFetch = globalThis.fetch;
mock.module('../../src/lib/rcon/service', () => ({
  executeAcknowledgedBatch: async (commands: string[]) => { sent.push(commands); return successfulProcessingFixture(commands); },
}));
try {
  const { POST: save } = await import('../../src/app/api/config/[...path]/route');
  const { GET: preview } = await import('../../src/app/api/apply/preview/route');
  const { POST: apply } = await import('../../src/app/api/apply/route');
  const { reviewRows, selectedReviewCommands } = await import('../../src/components/console/model');
  const { useConfigStore, flushConfigWrites } = await import('../../src/lib/store/configStore');
  const { CHARACTER_CONFIG_OPTIONS } = await import('../../src/lib/config/characterConfigSchema');
  const { WEAPON_CONFIG_OPTIONS } = await import('../../src/lib/config/weaponConfigSchema');
  const { MOVEMENT_CONFIG_OPTIONS } = await import('../../src/lib/config/movementConfigSchema');
  const { STUN_CONFIG_OPTIONS } = await import('../../src/lib/config/stunConfigSchema');
  const { DataType } = await import('../../src/lib/config/types');
  assert.equal(CHARACTER_CONFIG_OPTIONS.Movement.length, 25);
  assert.equal(Object.keys(CHARACTER_CONFIG_OPTIONS).length, 14);
  const characterEntries = Object.values(CHARACTER_CONFIG_OPTIONS).flat();
  assert.equal(characterEntries.length, 178 + STUN_CONFIG_OPTIONS.length);
  assert.equal(Object.values(WEAPON_CONFIG_OPTIONS).flat().length, 63);
  assert.equal(new Set(characterEntries.map(entry => entry.configKey)).size, characterEntries.length);
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    assert(url.startsWith('/api/config/'));
    return save(new Request('http://localhost' + url, init) as never, {
      params: Promise.resolve({ path: url.slice('/api/config/'.length).split('/') }),
    });
  }) as unknown as typeof fetch;
  const request = (body: unknown) => new Request('http://localhost/api', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const store = useConfigStore.getState();
  const prefix = 'string ezconfig Character Movement ';
  async function readRows() {
    await flushConfigWrites();
    const response = await preview(); assert.equal(response.status, 200);
    return reviewRows((await response.json()).commands);
  }
  async function applyRows(rows: ReturnType<typeof reviewRows>, selectedKeys?: string[], wipe = false) {
    const selected = selectedKeys ? rows.filter(row => row.category === 'Movement' && selectedKeys.includes(row.key)) : rows;
    const commands = selectedReviewCommands(rows, new Set(selected.map(row => row.id)));
    assert.equal((await apply(request({ commands, wipeDatabase: wipe }))).status, 200);
    assert.deepEqual(sent[sent.length - 1], wipe ? ['string ezconfig WipeDatabases', ...commands] : commands);
    return commands;
  }
  const values = {
    MaxWalkSpeed: 450,
    MaxWalkSpeedCrouched: 0,
    MaxWalkSpeedCrouchedWithRatPerk: 296,
    PartialSprintModifier: -.5,
    SprintModifier: 1.9,
    SprintAcceleration: 200,
    SupersprintModifier: 2.3,
    BackpedalModifier: -.2,
    StrafeModifier: .7,
    AttackSupersprintDuration: 0,
    SecondAttackSupersprintDuration: .42,
    SubSprintSpeedBonusEquipped: -.2,
    SecondSubSprintSpeedBonusEquipped: 0,
  };
  const keys = Object.keys(values);
  assert.equal(keys.length, 13);
  assert.deepEqual(MOVEMENT_CONFIG_OPTIONS.map(entry => entry.configKey).sort(), [...keys].sort());
  assert(MOVEMENT_CONFIG_OPTIONS.every(entry => entry.dataType === DataType.Float && entry.isImplemented && entry.requiresExplicitValue && entry.default === undefined));
  store.setValue('Character', 'Movement', 'TimeToMaxSprint', .8);
  store.setValue('Character', 'Recovery', 'WorldRecoveryTime', .65);
  assert(!(await readRows()).some(row => keys.includes(row.key)));
  // Reverse insertion separates transport correctness from the schema's display order.
  for (const [key, value] of Object.entries(values).reverse()) store.setValue('Character', 'Movement', key, value);
  const rows = await readRows();
  assert.equal(rows.length, 15);
  const formatted = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.toFixed(2)]));
  assert.deepEqual(Object.fromEntries(rows.filter(row => keys.includes(row.key)).map(row => [row.key, row.value])), formatted);
  const combined = await applyRows(rows, keys);
  assert.equal(combined.length, 1);
  assert(combined[0].startsWith(prefix));
  assert.deepEqual(JSON.parse(combined[0].slice(prefix.length)), formatted);
  for (const [key, value] of Object.entries(values)) {
    const commands = await applyRows(rows, [key]);
    assert.equal(commands.length, 1);
    assert(commands[0].startsWith(prefix));
    assert.deepEqual(JSON.parse(commands[0].slice(prefix.length)), { [key]: value.toFixed(2) }, 'each key is individually selectable without adjacent controls');
  }
  // Remove keys from component, crouch and equipment families in the same saved config.
  const removed = ['MaxWalkSpeed', 'MaxWalkSpeedCrouchedWithRatPerk', 'SprintModifier', 'AttackSupersprintDuration', 'SubSprintSpeedBonusEquipped'];
  for (const key of removed) store.removeValue('Character', 'Movement', key);
  const resetRows = await readRows();
  const retained = Object.fromEntries(Object.entries(formatted).filter(([key]) => !removed.includes(key)));
  assert.deepEqual(Object.fromEntries(resetRows.filter(row => keys.includes(row.key)).map(row => [row.key, row.value])), retained);
  assert(resetRows.some(row => row.key === 'TimeToMaxSprint' && row.value === '0.80'));
  assert(resetRows.some(row => row.category === 'Recovery' && row.key === 'WorldRecoveryTime' && row.value === '0.65'));
  await applyRows(resetRows, undefined, true);
  for (const key of keys) store.removeValue('Character', 'Movement', key);
  const cleared = await readRows();
  assert.equal(cleared.length, 2);
  assert(!cleared.some(row => keys.includes(row.key)));
  const remaining = await applyRows(cleared, undefined, true);
  assert.deepEqual(JSON.parse(remaining.find(command => command.startsWith(prefix))!.slice(prefix.length)), { TimeToMaxSprint: '0.80' });
  assert(remaining.some(command => command.startsWith('string ezconfig Character Recovery ')));
  // Safe native follow-through scenario, captured from the same real apply boundary.
  const gameplayValues = {
    MaxWalkSpeed: 120, MaxWalkSpeedCrouched: 81, MaxWalkSpeedCrouchedWithRatPerk: 163,
    BackpedalModifier: .47, StrafeModifier: .61, PartialSprintModifier: 1.13,
    SprintModifier: 1.83, SprintAcceleration: 800, SupersprintModifier: 1.7,
    SubSprintSpeedBonusEquipped: .12, SecondSubSprintSpeedBonusEquipped: -.04,
    AttackSupersprintDuration: .42, SecondAttackSupersprintDuration: .18, TimeToMaxSprint: .53,
  };
  for (const [key, value] of Object.entries(gameplayValues)) store.setValue('Character', 'Movement', key, value);
  const gameplayCommands = await applyRows(await readRows(), undefined, true);
  assert.deepEqual(JSON.parse(gameplayCommands.find(command => command.startsWith(prefix))!.slice(prefix.length)),
    Object.fromEntries(Object.entries(gameplayValues).map(([key, value]) => [key, value.toFixed(2)])));
  if (process.env.EZCONFIG_CAPTURE_MOVEMENT_COMMANDS === '1') {
    const artifactDirectory = resolve('.scratch/movement-ui');
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(join(artifactDirectory, 'ticket06-captured-rcon.json'), JSON.stringify({
      source: 'Real store -> temporary persistence -> review -> selected apply -> captured RCON transport',
      movementValues: gameplayValues,
      recoveryValues: { WorldRecoveryTime: .65 },
      commands: sent[sent.length - 1],
    }, null, 2) + '\n', 'utf8');
  }
  console.log('PASS: 13 combined Movement additions, complete unique schema, independent selection, signed/zero values, partial/all Reset with wipe ordering and TimeToMaxSprint/Recovery preservation');
} finally {
  globalThis.fetch = originalFetch;
  const target = resolve(root);
  assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith('ezconfig-movement-combined-'));
  await rm(target, { recursive: true, force: true });
}
