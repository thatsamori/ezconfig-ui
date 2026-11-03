import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActivitySection } from '../src/components/operator/StatusPage';
import type { PlatformStatus } from '../src/lib/platform/status';

// The Status tab's Activity section (online-platform#48). The counts themselves are in platform-status.test.ts.

const activity: PlatformStatus['activity'] = {
  serverOwners: { total: 5, seenLast24h: 2, seenLast7Days: 4 },
  liveConfigurations: { pending: 1, blocked: 6, confirmed: 7, failed: 8, none: 9 },
  gameServersApplied: { last24h: 3, last7Days: 10 },
};
const section = (fields: Partial<PlatformStatus['activity']> = {}) => renderToStaticMarkup(createElement(ActivitySection, { activity: { ...activity, ...fields } }));
/** The text a reader sees, tags removed. */
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the Activity section', () => {
  test('shows each count under its label', () => {
    const shown = text(section());
    expect(shown).toContain('Server owners 5 · 2 seen in the last 24 h · 4 in the last 7 days');
    expect(shown).toContain('Live configurations 1 Pending 6 Blocked 7 Confirmed 8 Failed');
    expect(shown).toContain('No Live configuration yet 9 game servers');
    expect(shown).toContain('Game servers Applied 3 in the last 24 h · 10 in the last 7 days');
  });

  test('says what the counts leave out: Applies, and last seen that is old or gone', () => {
    const shown = text(section());
    expect(shown).toContain('counts game servers, not Applies');
    expect(shown).toContain('written at most once an hour');
    expect(shown).toContain('signing out clears it');
    expect(shown).toContain('include you');
  });

  test('shows zeros, and one game server in the singular', () => {
    expect(text(section({ liveConfigurations: { pending: 0, blocked: 0, confirmed: 0, failed: 0, none: 1 } }))).toContain('0 Pending 0 Blocked 0 Confirmed 0 Failed No Live configuration yet 1 game server Game servers Applied');
  });

  test('marks each state with the dot the game server pages use', () => {
    const html = section();
    for (const state of ['pending', 'blocked', 'confirmed', 'failed']) expect(html).toContain(`status-dot ${state}`);
  });
});
