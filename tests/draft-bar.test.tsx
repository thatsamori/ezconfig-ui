import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DraftStanding, draftMenu, overridesText } from '../src/components/console/DraftBar';
import { blockedReason, RefusedValues } from '../src/components/game-servers/ApplyDialog';
import type { GameServerView } from '../src/lib/platform/game-servers';
import type { Origin } from '../src/lib/platform/origins';
import { holdRefused, refusedCount, useConfigStore, type RefusedValue } from '../src/lib/store/configStore';

// The editor's bar (online-platform#47): where the Draft stands, and its ⋯ menu.

const now = Date.now();
const origin: Origin = { rulesetId: 4, rulesetName: 'Competitive', versionId: 9, number: 3, modified: true };
const view = (fields: Partial<GameServerView>): GameServerView => ({
  id: 1, name: 'Oregon Duels', keyLast4: 'wxyz', registeredAt: now, connection: { state: 'connected' }, sharedKey: false,
  lastReport: null, needsUpdating: null, liveConfiguration: null, unappliedChanges: false, draftOrigin: null, liveOrigin: null, applyBlocked: null,
  ...fields,
});
const standing = (server: GameServerView | undefined, extra: { error?: string; origin?: Origin | null; refused?: number } = {}) =>
  renderToStaticMarkup(createElement(DraftStanding, { server, error: extra.error, overrides: overridesText(3), origin: extra.origin ?? null, refused: extra.refused, onShowServer: () => {} }));
/** The text a reader sees, tags removed. */
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the ⋯ menu', () => {
  const labels = (groups: ReturnType<typeof draftMenu>) => groups.map(group => [group.label, group.items.map(item => item.label)]);
  test('saves as a new Ruleset, and loads a Ruleset version or game defaults', () => {
    expect(labels(draftMenu(null, false))).toEqual([
      ['Save the Draft as', ['New Ruleset…']],
      ['Load into the Draft', ['Ruleset version…', 'Game defaults…']],
    ]);
  });
  test("with an origin, saves as the next version of its Ruleset; with Unapplied changes from a Live configuration, loads that (Discard changes)", () => {
    expect(labels(draftMenu(origin, true))).toEqual([
      ['Save the Draft as', ['New Ruleset…', 'Next version of Competitive…']],
      ['Load into the Draft', ['Ruleset version…', 'Game defaults…', 'Live configuration…']],
    ]);
    expect(draftMenu(origin, true).flatMap(group => group.items.map(item => item.action))).toEqual(['save-new', 'save-next', 'load-version', 'load-defaults', 'load-live']);
  });
});

describe('where the Draft stands', () => {
  test('counts overrides', () => {
    expect([0, 1, 3].map(overridesText)).toEqual(['Everything at game default', '1 override', '3 overrides']);
  });
  test('before the game server loads: the overrides, then the error if it does not', () => {
    expect(text(standing(undefined))).toBe('3 overrides Checking the game server…');
    const failed = standing(undefined, { error: 'Could not reach the platform' });
    expect(failed).toContain('role="alert"');
    expect(text(failed)).toContain('Could not reach the platform');
  });
  test('Unapplied changes beside a Confirmed Live configuration, with the origin and the connection', () => {
    const html = standing(view({ unappliedChanges: true, liveConfiguration: { id: 'a', appliedAt: now, state: 'confirmed', reportedAt: now, ignoredKeys: [] } }), { origin });
    expect(html).toContain('<strong class="unapplied">Unapplied changes</strong>');
    expect(html).toContain('status-dot unapplied');
    expect(text(html)).toContain('3 overrides from Competitive version 3 Modified');
    expect(text(html)).toContain('Live configuration Confirmed just now · Connected');
    expect(html).not.toContain('Details');
  });
  test('a Draft that matches a Pending Live configuration says when it was applied', () => {
    const html = standing(view({ liveConfiguration: { id: 'a', appliedAt: now, state: 'pending' } }));
    expect(text(html)).toContain('Matches the Live configuration 3 overrides');
    expect(text(html)).toContain('Pending applied just now');
  });
  test('nothing applied yet, on a game server that never connected', () => {
    const html = standing(view({ connection: { state: 'never-connected' }, applyBlocked: 'never-connected' }));
    expect(text(html)).toContain('Nothing applied yet 3 overrides');
    expect(text(html)).toContain('No Live configuration yet · Never connected');
  });
  test('Failed and Blocked link to the game server page, which explains them', () => {
    const failed = standing(view({ liveConfiguration: { id: 'a', appliedAt: now, state: 'failed', reportedAt: now, failure: { database: 'Character', category: 'Stun', error: 'x' } } }));
    const blocked = standing(view({ liveConfiguration: { id: 'a', appliedAt: now, state: 'blocked', refusedValues: [] } }));
    for (const html of [failed, blocked]) expect(html).toContain('<button type="button" class="link-button">Details</button>');
  });
});

describe('a value a field refuses (online-platform#51)', () => {
  const live: GameServerView['liveConfiguration'] = { id: 'a', appliedAt: now, state: 'confirmed', reportedAt: now, ignoredKeys: [] };
  const fov: RefusedValue = { database: 'Character', category: 'Camera', key: 'CustomFOVMax', text: '500', error: 'Use a finite value from 101 to 179.', discard: () => {} };
  test('the bar says so, and not that the Draft matches the Live configuration', () => {
    const html = standing(view({ liveConfiguration: live }), { refused: 1 });
    expect(html).toContain('<strong class="refused">1 refused value</strong>');
    expect(html).toContain('status-dot blocked');
    expect(text(html)).not.toContain('Matches the Live configuration');
    expect(text(html)).toContain('1 refused value 3 overrides');
  });
  test('the bar says so before Unapplied changes or nothing applied yet, and counts', () => {
    expect(text(standing(view({ liveConfiguration: live, unappliedChanges: true }), { refused: 2 }))).toContain('2 refused values 3 overrides');
    expect(text(standing(view({}), { refused: 1 }))).toContain('1 refused value 3 overrides');
  });
  test('with none, the bar is as it was', () => {
    expect(text(standing(view({ liveConfiguration: live }), { refused: 0 }))).toContain('Matches the Live configuration 3 overrides');
  });
  test('a field holds its value until it lets go, and the same field is counted once with a mark', () => {
    const release = holdRefused(fov);
    expect(useConfigStore.getState().refused).toEqual([fov]);
    expect(refusedCount(useConfigStore.getState())).toBe(1);
    expect(refusedCount({ refused: [fov], fieldErrors: { 'Character/Camera/CustomFOVMax': 'Use a whole number.' } })).toBe(1);
    expect(refusedCount({ refused: [fov], fieldErrors: { 'Character/Stun/FreeStunDuration': 'Use a finite value of 0 or more.' } })).toBe(2);
    release();
    expect(useConfigStore.getState().refused).toEqual([]);
    expect(refusedCount(useConfigStore.getState())).toBe(0);
  });
  test('the review names the key and where it is, with what was typed', () => {
    const html = renderToStaticMarkup(createElement(RefusedValues, { values: [fov, { ...fov, database: 'ArmingSword', category: 'General', key: 'WeaponLength', text: '', error: 'Enter a value.' }] }));
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain('Refused, so not in the Draft: fix or discard before you Apply');
    expect(text(html)).toContain('Camera · CustomFOVMax 500: Use a finite value from 101 to 179.');
    expect(text(html)).toContain('ArmingSword · General · WeaponLength Enter a value.');
  });
});

test('Apply says why it is disabled', () => {
  expect(blockedReason(view({}))).toBeUndefined();
  expect(blockedReason(view({ applyBlocked: 'not-connected' }))).toBe('Not connected');
  expect(blockedReason(view({ applyBlocked: 'needs-updating', needsUpdating: { running: null, supported: '20261103-090000' } }))).toBe('EZConfig needs updating');
  expect(blockedReason(view({ applyBlocked: 'needs-updating', needsUpdating: { running: null, supported: null } }))).toBe('No Supported build yet');
});
