// FreeStun toggle and duration through the editor and Apply, on the feature review harness.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { categoryEntries, featureReview, WIPE } from './feature-review-harness';

await featureReview('free-stun', async ({ set, reset, saved, saveUnchecked, storeUnvalidated, apply }) => {
  const key = 'FreeStunDuration';
  const prefix = 'string ezconfig Character Stun ';
  const stunCommand = (batch: string[]) => batch.find(command => command.startsWith(prefix))!;
  const capture: { cases: { value: number; command: string }[]; removal?: string[]; omittedUpsert?: string; disabled?: string; parameterRemoval?: string[]; toggleRemoval?: string[] } = { cases: [] };
  set('Character', 'Chftp', 'ChftpStunDuration', 2.3);
  set('Character', 'Stun', 'FreeStun', true);
  set('Character', 'Stun', 'OutOfStaminaStunDuration', 0.6);
  for (const value of [0.25, 0.6, 1.6, 0, 0.000001, 1.075]) {
    set('Character', 'Stun', key, value);
    assert.equal(await saved('Character', 'Stun', key), value);
    const batch = await apply();
    assert.deepEqual(categoryEntries(batch, 'Character', 'Stun'), { FreeStun: 'True', OutOfStaminaStunDuration: '0.6', [key]: String(value) });
    assert.deepEqual(categoryEntries(batch, 'Character', 'Chftp'), { ChftpStunDuration: '2.30' });
    capture.cases.push({ value, command: stunCommand(batch) });
  }

  // The editor refuses these: had it sent one, the save would fail or change the value.
  for (const value of [-1, Infinity, NaN, 1e40, Number.MIN_VALUE]) set('Character', 'Stun', key, value);
  assert.equal(await saved('Character', 'Stun', key), 1.075);
  for (const value of [-1, '0', 1e40, Number.MIN_VALUE]) {
    assert.equal(await saveUnchecked('Character', 'Stun', { [key]: value }), 400);
    assert.equal(await saved('Character', 'Stun', key), 1.075);
  }

  // Disabling the toggle keeps its duration parameter.
  set('Character', 'Stun', 'FreeStun', false);
  set('Character', 'Stun', key, 1.6);
  const disabled = await apply();
  assert.deepEqual(categoryEntries(disabled, 'Character', 'Stun'), { FreeStun: 'False', OutOfStaminaStunDuration: '0.6', FreeStunDuration: '1.6' });
  capture.disabled = stunCommand(disabled);

  // A damaged saved value must stop Apply before its wipe is sent, rather
  // than relying on a later server rejection; the harness checks nothing was delivered.
  await storeUnvalidated('Character', 'Stun', { [key]: 1e40 });
  await assert.rejects(apply(), /Apply was refused \(400\)/);
  set('Character', 'Stun', key, 1.6);
  assert.equal(await saved('Character', 'Stun', key), 1.6);

  // Each Reset removes only its key; the wipe clears its earlier server state.
  reset('Character', 'Stun', 'FreeStun');
  capture.toggleRemoval = await apply();
  assert.deepEqual(categoryEntries(capture.toggleRemoval, 'Character', 'Stun'), { OutOfStaminaStunDuration: '0.6', [key]: '1.6' });
  set('Character', 'Stun', 'FreeStun', true);
  reset('Character', 'Stun', key);
  capture.parameterRemoval = await apply();
  assert.deepEqual(categoryEntries(capture.parameterRemoval, 'Character', 'Stun'), { FreeStun: 'True', OutOfStaminaStunDuration: '0.6' });
  reset('Character', 'Stun', 'FreeStun');
  capture.removal = await apply();
  assert.equal(capture.removal[0], WIPE);
  assert(!capture.removal.some(command => command.includes(key)));
  assert.deepEqual(categoryEntries(capture.removal, 'Character', 'Stun'), { OutOfStaminaStunDuration: '0.6' });
  capture.omittedUpsert = 'string ezconfig Character Stun {}';
  if (process.env.EZ_FREE_STUN_CAPTURE_PATH) await writeFile(process.env.EZ_FREE_STUN_CAPTURE_PATH, JSON.stringify(capture, null, 2));
});
console.log('PASS: FreeStun editor/persistence/Apply preserves all three independent keys, disabled parameter, zero/default/precision and scoped removal; invalid edits/saved values stop before mutation.');
