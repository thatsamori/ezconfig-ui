import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DraftStanding, draftMenu, overridesText } from '../src/components/console/DraftBar';
import { blockedReason } from '../src/components/game-servers/ApplyDialog';
import type { GameServerView } from '../src/lib/platform/game-servers';
import type { Origin } from '../src/lib/platform/origins';

// The editor's bar (online-platform#47): where the Draft stands, and its ⋯ menu.

const now = Date.now();
const origin: Origin = { rulesetId: 4, rulesetName: 'Competitive', versionId: 9, number: 3, modified: true };
const view = (fields: Partial<GameServerView>): GameServerView => ({
  id: 1, name: 'Oregon Duels', keyLast4: 'wxyz', registeredAt: now, connection: { state: 'connected' }, sharedKey: false,
  lastReport: null, needsUpdating: null, liveConfiguration: null, unappliedChanges: false, draftOrigin: null, liveOrigin: null, applyBlocked: null,
  ...fields,
});
const standing = (server: GameServerView | undefined, extra: { error?: string; origin?: Origin | null } = {}) =>
  renderToStaticMarkup(createElement(DraftStanding, { server, error: extra.error, overrides: overridesText(3), origin: extra.origin ?? null, onShowServer: () => {} }));
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

test('Apply says why it is disabled', () => {
  expect(blockedReason(view({}))).toBeUndefined();
  expect(blockedReason(view({ applyBlocked: 'not-connected' }))).toBe('Not connected');
  expect(blockedReason(view({ applyBlocked: 'needs-updating', needsUpdating: { running: null, supported: '20261103-090000' } }))).toBe('EZConfig needs updating');
  expect(blockedReason(view({ applyBlocked: 'needs-updating', needsUpdating: { running: null, supported: null } }))).toBe('No Supported build yet');
});
