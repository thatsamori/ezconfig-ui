import { mkdir, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { strict as assert } from 'assert';
import type { NextRequest } from 'next/server';
import { signInForTest, type TestSession } from '../helpers/platform-session';

const root = await mkdtemp(join(tmpdir(), 'ezconfig-collaboration-'));
process.env.DATABASES_PATH = join(root, 'Databases');
process.env.DATABASE_PATH = join(root, 'platform.db');
let session: TestSession | undefined;
try {
  await mkdir(process.env.DATABASES_PATH);
  session = await signInForTest();
  const signedIn = session;
  const { PATCH, POST } = await import('../../src/app/api/config/[...path]/route');
  const { GET: metadata } = await import('../../src/app/api/config/revision/route');
  const { GET: snapshot } = await import('../../src/app/api/databases/overrides/route');
  const { DELETE: clear } = await import('../../src/app/api/config/clear/route');
  const { POST: bulk } = await import('../../src/app/api/config/bulk-weapons/route');
  const { readCategory } = await import('../../src/lib/database/service');
  const context = { params: Promise.resolve({ path: ['ArmingSword', 'Strike'] }) };
  const request = (entries: unknown, method = 'PATCH') => signedIn.request('/api/config/ArmingSword/Strike', {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }),
  }) as NextRequest;
  const initial = await (await metadata(signedIn.request('/api/config/revision'))).json();
  assert.equal(initial.savedAt, null);
  const responses = await Promise.all([
    PATCH(request({ Windup: 0.4 }), context),
    PATCH(request({ CanCombo: false }), context),
  ]);
  assert.ok(responses.every(response => response.ok));
  assert.deepEqual(await readCategory('ArmingSword', 'Strike'), { Windup: 0.4, CanCombo: false });
  const saved = await (await metadata(signedIn.request('/api/config/revision'))).json();
  assert.notEqual(saved.revision, initial.revision);
  assert.ok(Date.parse(saved.savedAt));
  const fullResponse = await snapshot(signedIn.request('/api/databases/overrides'));
  assert.equal(fullResponse.headers.get('Cache-Control'), 'no-store');
  const full = await fullResponse.json();
  assert.equal(full.revision, saved.revision);
  assert.deepEqual(full.values.weapons.ArmingSword.Strike, { Windup: 0.4, CanCombo: false });
  assert.equal((await PATCH(request({ UnknownKey: null }), context)).status, 400);
  assert.equal((await (await metadata(signedIn.request('/api/config/revision'))).json()).revision, saved.revision);
  await PATCH(request({ Windup: null }), context);
  assert.deepEqual(await readCategory('ArmingSword', 'Strike'), { CanCombo: false });
  const reset = await (await metadata(signedIn.request('/api/config/revision'))).json();
  assert.ok(reset.savedAt > saved.savedAt);
  await bulk(signedIn.request('/api/config/bulk-weapons', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'Strike', weaponValues: { ArmingSword: { Windup: 0.6 } } }),
  }) as NextRequest);
  assert.deepEqual(await readCategory('ArmingSword', 'Strike'), { CanCombo: false, Windup: 0.6 });
  const swept = await (await metadata(signedIn.request('/api/config/revision'))).json();
  assert.notEqual(swept.revision, reset.revision);
  await POST(request({ Windup: 0.8 }, 'POST'), context);
  assert.deepEqual(await readCategory('ArmingSword', 'Strike'), { Windup: 0.8 });
  await PATCH(request({ Windup: null }), context);
  assert.deepEqual(await readCategory('ArmingSword', 'Strike'), {});
  const removed = await (await metadata(signedIn.request('/api/config/revision'))).json();
  assert.notEqual(removed.revision, swept.revision);
  assert.equal((await clear(signedIn.request('/api/config/clear', { method: 'DELETE' }))).status, 200);
  const cleared = await (await metadata(signedIn.request('/api/config/revision'))).json();
  assert.notEqual(cleared.revision, removed.revision);
  assert.deepEqual((await (await snapshot(signedIn.request('/api/databases/overrides'))).json()).values, { character: {}, weapons: {} });
} finally {
  session?.close();
  // root is exclusively created above by mkdtemp for this fixture.
  await rm(root, { recursive: true, force: true });
}
