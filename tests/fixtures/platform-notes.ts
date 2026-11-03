/**
 * Notes through the route handlers (online-platform#36): the author from the
 * session, own-only edit and delete, the platform operator's delete, the body
 * sanitizer, Notes on keys the schema lacks, and "a former server owner". One
 * scenario per run (argv[2]), each in its own process with the env set by
 * tests/platform-notes.test.ts; time is moved with setSystemTime.
 *
 * Asserts as it goes, then prints one `{"fixture": …}` line with every body
 * and server owner name it sent, so the test can check that no log line holds
 * one.
 */
import { setSystemTime } from 'bun:test';
import assert from 'node:assert/strict';
import { signInForTest, type TestSession } from '../helpers/platform-session';
import type { KeyNotes, NotesByKey, NoteView } from '../../src/lib/platform/notes';

const { env } = await import('../../src/lib/env');
const { platformStore } = await import('../../src/lib/platform/storage');
const notesRoute = await import('../../src/app/api/notes/route');
const noteRoute = await import('../../src/app/api/notes/[id]/route');
const gameServersRoute = await import('../../src/app/api/game-servers/route');
const draftRoute = await import('../../src/app/api/game-servers/[id]/draft/route');

const scenario = process.argv[2];
const secrets = new Set<string>();
const [OPERATOR_ID] = env.operatorDiscordIds;
const T0 = Date.UTC(2026, 10, 2, 12);
const at = (time: number) => setSystemTime(new Date(time));
at(T0);

type Body = { success: boolean; error?: string; data?: unknown };
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const answer = async (response: Response) => ({ status: response.status, cache: response.headers.get('Cache-Control'), body: await response.json() as Body });
const params = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

async function signIn(name: string, discordId?: string) {
  secrets.add(name);
  return signInForTest(name, discordId);
}
/** A body to send: it is recorded so the test can check no log line holds it. */
function body(html: string) {
  secrets.add(html);
  return html;
}
async function list(session: TestSession): Promise<NotesByKey> {
  const { status, cache, body } = await answer(await notesRoute.GET(session.request('/api/notes')));
  assert.equal(status, 200);
  assert.equal(cache, 'no-store');
  return body.data as NotesByKey;
}
const add = async (session: TestSession, fields: Record<string, unknown>) => answer(await notesRoute.POST(session.request('/api/notes', json('POST', fields))));
const edit = async (session: TestSession, id: number | string, fields: unknown) => answer(await noteRoute.PUT(session.request(`/api/notes/${id}`, json('PUT', fields)), params(id)));
const remove = async (session: TestSession, id: number | string) => answer(await noteRoute.DELETE(session.request(`/api/notes/${id}`, { method: 'DELETE' }), params(id)));
/** Adds a Note that must be accepted, and returns it as its author sees it. */
async function added(session: TestSession, database: string, key: string, html: string): Promise<NoteView> {
  const { status, body: result } = await add(session, { database, key, body: body(html) });
  assert.equal(status, 201, result.error);
  const notes = result.data as KeyNotes;
  assert.deepEqual([notes.database, notes.key], [database, key]);
  return notes.notes.at(-1)!;
}
/** What a body is stored as, through a Note added and read back. */
async function stored(session: TestSession, html: string): Promise<string> {
  const note = await added(session, 'Character', 'MaxWalkSpeed', html);
  assert.equal((await remove(session, note.id)).status, 200);
  return note.body;
}

switch (scenario) {
  case 'author-from-session': {
    const ann = await signIn('Ann'), bob = await signIn('Bob');
    assert.deepEqual(await list(ann), { Character: {}, Weapon: {} }, 'no Notes yet');
    // A body that names another author, in every way the old routes took one, is still Ann's.
    const sent = await add(ann, { database: 'Character', key: 'MaxWalkSpeed', body: body('<p>Walk speed note</p>'), author: 'Bob', createdBy: 'Bob', authorId: bob.userId, userId: bob.userId });
    assert.equal(sent.status, 201);
    assert.equal(sent.cache, 'no-store');
    const annNote: NoteView = { id: 1, author: 'Ann', body: '<p>Walk speed note</p>', createdAt: T0, editedAt: null, canEdit: true, canDelete: true };
    assert.deepEqual(sent.body.data, { database: 'Character', key: 'MaxWalkSpeed', notes: [annNote] }, 'the add answers with the key\'s Notes');
    at(T0 + 60_000);
    await added(bob, 'Character', 'MaxWalkSpeed', '<p>Bob on walk speed</p>');
    await added(bob, 'Weapon', 'Windup', '<p>Bob on windup</p>');
    const bobNote: NoteView = { id: 2, author: 'Bob', body: '<p>Bob on walk speed</p>', createdAt: T0 + 60_000, editedAt: null, canEdit: true, canDelete: true };
    // Every server owner reads every Note, oldest first; each may change only their own.
    assert.deepEqual(await list(bob), {
      Character: { MaxWalkSpeed: [{ ...annNote, canEdit: false, canDelete: false }, bobNote] },
      Weapon: { Windup: [{ id: 3, author: 'Bob', body: '<p>Bob on windup</p>', createdAt: T0 + 60_000, editedAt: null, canEdit: true, canDelete: true }] },
    });
    assert.deepEqual((await list(ann)).Character.MaxWalkSpeed, [annNote, { ...bobNote, canEdit: false, canDelete: false }]);

    // Notes are kept by database and key name: never part of a Draft.
    const registered = await answer(await gameServersRoute.POST(ann.request('/api/game-servers', json('POST', { name: 'Duel EU' }))));
    const serverId = (registered.body.data as { gameServer: { id: number } }).gameServer.id;
    const draft = await answer(await draftRoute.GET(ann.request(`/api/game-servers/${serverId}/draft`), params(serverId)));
    assert.deepEqual(draft.body.data, { values: { character: {}, weapons: {} }, dropped: 0, revision: 0, savedAt: null, origin: null }, 'adding Notes leaves the Draft untouched');

    // What an add refuses: nothing is stored.
    const refusals = [
      [{ database: 'character', key: 'MaxWalkSpeed', body: '<p>x</p>' }, 400],
      [{ database: 'Weapon', key: 'MaxWalkSpeed', body: '<p>x</p>' }, 400],
      [{ database: 'Character', key: 'Windup', body: '<p>x</p>' }, 400],
      [{ database: 'Character', key: 'NoSuchKey', body: '<p>x</p>' }, 400],
      [{ database: 'Character', body: '<p>x</p>' }, 400],
      [{ database: 'Character', key: 'MaxWalkSpeed' }, 400],
      [{ database: 'Character', key: 'MaxWalkSpeed', body: 42 }, 400],
      [{ database: 'Character', key: 'MaxWalkSpeed', body: '<p> </p><p><br></p>' }, 400],
      [{ database: 'Character', key: 'MaxWalkSpeed', body: `<p>${'x'.repeat(64 * 1024)}</p>` }, 413],
    ] as const;
    for (const [fields, status] of refusals) assert.equal((await add(ann, fields)).status, status, JSON.stringify(fields).slice(0, 80));
    assert.equal((await answer(await notesRoute.POST(ann.request('/api/notes', json('POST', 'not json'))))).status, 400);
    assert.equal((await add(ann, { database: 'Character', key: 'MaxWalkSpeed', body: '<script>x()</script>' })).body.error, 'A Note needs some text');
    assert.equal(platformStore().get<{ count: number }>('SELECT COUNT(*) AS count FROM notes')!.count, 3, 'no refused add stored anything');

    // Every route needs a session, and a change must come from the platform's origin.
    const signedOut = (path: string, init: RequestInit = {}) => new Request(new URL(path, env.publicUrl), { ...init, headers: { ...init.headers, Origin: ann.origin } });
    assert.equal((await notesRoute.GET(signedOut('/api/notes'))).status, 401);
    assert.equal((await notesRoute.POST(signedOut('/api/notes', json('POST', { database: 'Character', key: 'MaxWalkSpeed', body: '<p>x</p>' })))).status, 401);
    assert.equal((await noteRoute.PUT(signedOut('/api/notes/1', json('PUT', { body: '<p>x</p>' })), params(1))).status, 401);
    assert.equal((await noteRoute.DELETE(signedOut('/api/notes/1', { method: 'DELETE' }), params(1))).status, 401);
    const foreign = new Request(new URL('/api/notes/1', env.publicUrl), { method: 'DELETE', headers: { Cookie: ann.cookie, Origin: 'https://elsewhere.test' } });
    assert.equal((await noteRoute.DELETE(foreign, params(1))).status, 403);
    assert.equal((await list(ann)).Character.MaxWalkSpeed.length, 2, 'nothing a refused request sent changed a Note');
    break;
  }

  case 'own-only': {
    const ann = await signIn('Ann'), bob = await signIn('Bob');
    const note = await added(ann, 'Character', 'MaxWalkSpeed', '<p>First words</p>');
    // Another owner can neither edit nor delete it.
    const bobEdit = await edit(bob, note.id, { body: body('<p>Bob was here</p>') });
    assert.deepEqual([bobEdit.status, bobEdit.body.error], [403, 'Only its author can edit a Note']);
    const bobDelete = await remove(bob, note.id);
    assert.deepEqual([bobDelete.status, bobDelete.body.error], [403, 'Only its author or the platform operator can delete a Note']);
    assert.deepEqual((await list(bob)).Character.MaxWalkSpeed, [{ ...note, canEdit: false, canDelete: false }], 'unchanged');

    // Its author edits it: the body is overwritten and the edited time set; created stays.
    at(T0 + 3_600_000);
    const edited = await edit(ann, note.id, { body: body('<p>Second <em>thoughts</em></p>'), author: 'Bob' });
    assert.equal(edited.status, 200);
    assert.equal(edited.cache, 'no-store');
    const after: NoteView = { ...note, body: '<p>Second <em>thoughts</em></p>', editedAt: T0 + 3_600_000 };
    assert.deepEqual(edited.body.data, { database: 'Character', key: 'MaxWalkSpeed', notes: [after] });
    assert.deepEqual((await list(bob)).Character.MaxWalkSpeed, [{ ...after, canEdit: false, canDelete: false }], 'every owner reads the edit, still by Ann');
    // An edit that leaves no text is refused and changes nothing.
    assert.equal((await edit(ann, note.id, { body: '<script>x()</script>' })).status, 400);
    assert.equal((await edit(ann, note.id, {})).status, 400);
    assert.equal((await edit(ann, note.id, { body: `<p>${'x'.repeat(64 * 1024)}</p>` })).status, 413);
    assert.deepEqual((await list(ann)).Character.MaxWalkSpeed, [after]);

    // Its author deletes it; then it names no Note.
    const deleted = await remove(ann, note.id);
    assert.deepEqual([deleted.status, deleted.body.data], [200, { database: 'Character', key: 'MaxWalkSpeed', notes: [] }]);
    assert.deepEqual(await list(bob), { Character: {}, Weapon: {} });
    assert.equal((await remove(ann, note.id)).status, 404);
    assert.equal((await edit(ann, note.id, { body: '<p>back</p>' })).status, 404);
    for (const id of ['0', 'abc', '1.5', '-1', '99999']) {
      assert.equal((await remove(ann, id)).status, 404, id);
      assert.equal((await edit(ann, id, { body: '<p>x</p>' })).status, 404, id);
    }
    break;
  }

  case 'operator': {
    const ann = await signIn('Ann'), operator = await signIn('Olive', OPERATOR_ID);
    const note = await added(ann, 'Weapon', 'ParryTurnCap', '<p>Ann on turn cap</p>');
    // The operator may delete it, never edit it.
    assert.deepEqual((await list(operator)).Weapon.ParryTurnCap, [{ ...note, canEdit: false, canDelete: true }]);
    assert.equal((await edit(operator, note.id, { body: body('<p>Olive\'s words</p>') })).status, 403);
    assert.deepEqual((await list(ann)).Weapon.ParryTurnCap, [note], 'the refused edit changed nothing');
    console.log(JSON.stringify({ step: 'operator deletes another owner\'s Note' }));
    const deleted = await remove(operator, note.id);
    assert.deepEqual([deleted.status, deleted.body.data], [200, { database: 'Weapon', key: 'ParryTurnCap', notes: [] }]);
    assert.deepEqual(await list(ann), { Character: {}, Weapon: {} });

    // Their own Note they edit and delete as its author.
    const own = await added(operator, 'Weapon', 'ParryTurnCap', '<p>Olive on turn cap</p>');
    assert.deepEqual((await list(ann)).Weapon.ParryTurnCap, [{ ...own, canEdit: false, canDelete: false }]);
    assert.equal((await edit(operator, own.id, { body: body('<p>Olive, edited</p>') })).status, 200);
    console.log(JSON.stringify({ step: 'operator deletes their own Note' }));
    assert.equal((await remove(operator, own.id)).status, 200);
    break;
  }

  case 'sanitizer': {
    const ann = await signIn('Ann');
    const cases: [string, string, string][] = [
      ['the allowlist is kept', '<p>A <strong>b</strong> <em>i</em> <u>u</u> <code>x &lt; 3</code><br>next</p><ul><li><p>one</p></li></ul><ol><li><p>two</p></li></ol>',
        '<p>A <strong>b</strong> <em>i</em> <u>u</u> <code>x &lt; 3</code><br />next</p><ul><li><p>one</p></li></ul><ol><li><p>two</p></li></ol>'],
      ['bold and italic tags become the editor\'s', '<p><b>b</b> <i>i</i></p>', '<p><strong>b</strong> <em>i</em></p>'],
      ['script goes with its content', '<p>before<script>alert(document.cookie)</script>after</p>', '<p>beforeafter</p>'],
      ['script in other forms', '<p>x</p><SCRIPT SRC="https://evil.test/x.js"></SCRIPT><svg><script>alert(1)</script></svg><iframe src="javascript:alert(1)"></iframe>', '<p>x</p>'],
      ['event handlers go', '<p onclick="alert(1)" onmouseover="alert(2)">hi</p><img src="x" onerror="alert(3)">', '<p>hi</p>'],
      ['styles go', '<p style="color:red;background:url(javascript:alert(1))">hi</p><style>p { color: red }</style>', '<p>hi</p>'],
      ['classes, ids and other attributes go', '<p class="x" id="y" data-z="1" title="t">hi</p>', '<p>hi</p>'],
      ['a javascript: link loses the link and keeps its text', '<p><a href="javascript:alert(1)">click</a></p>', '<p>click</p>'],
      ['a disguised javascript: link too', '<a href="  JaVaScRiPt:alert(1)">a</a><a href="jav&#x61;script:alert(1)">b</a><a href="java&#9;script:alert(1)">c</a><a href="&#106;avascript:alert(1)">d</a>', 'abcd'],
      ['data:, vbscript:, mailto: and file: links too', '<a href="data:text/html,<script>alert(1)</script>">a</a><a href="vbscript:x">b</a><a href="mailto:a@b.test">c</a><a href="file:///etc/passwd">d</a>', 'abcd'],
      ['relative, protocol-relative and empty links too', '<a href="/api/notes">a</a><a href="//evil.test">b</a><a href="#x">c</a><a>d</a>', 'abcd'],
      ['an http(s) link is kept, opening apart from the platform', '<p><a href="https://example.test/guide?a=1&amp;b=2" onclick="x()" target="_self" rel="opener">guide</a> <a href="HTTP://Example.test">plain</a></p>',
        '<p><a href="https://example.test/guide?a=1&amp;b=2" target="_blank" rel="noopener noreferrer nofollow">guide</a> <a href="http://example.test/" target="_blank" rel="noopener noreferrer nofollow">plain</a></p>'],
      ['a stripped link leaves the links and markup after it whole', '<p><a href="javascript:alert(1)">bad</a> <a href="https://example.test/">good</a> <a href="/x"><strong>rel</strong></a> <em>end</em></p>',
        '<p>bad <a href="https://example.test/" target="_blank" rel="noopener noreferrer nofollow">good</a> <strong>rel</strong> <em>end</em></p>'],
      ['a link\'s address is kept as the browser reads it', '<a href="https://example.test/a b&quot;onmouseover=&quot;x">x</a>', '<a href="https://example.test/a%20b%22onmouseover=%22x" target="_blank" rel="noopener noreferrer nofollow">x</a>'],
      ['other elements go and keep their text', '<h1>Title</h1><div><span>in</span> a <s>strike</s> <blockquote>quote</blockquote></div><pre>code</pre>', 'Titlein a strike quotecode'],
      ['forms, media and embeds go', '<p>x</p><form action="https://evil.test"><input value="v"><button>b</button></form><img src="https://evil.test/i.png"><object data="x"></object><embed src="x">', '<p>x</p>b'],
      ['comments go', '<p>a<!-- <script>alert(1)</script> -->b</p>', '<p>ab</p>'],
      ['text that looks like markup stays text', 'Use x < 3 && y > 2', 'Use x &lt; 3 &amp;&amp; y &gt; 2'],
      ['markup hidden in raw text goes', '<xmp><img src=x onerror=alert(1)></xmp><noscript><p title="</noscript><img src=x onerror=alert(1)>">t</p></noscript>', '<p>t</p>'],
    ];
    for (const [rule, input, expected] of cases) assert.equal(await stored(ann, body(input)), expected, rule);
    // An edit is sanitized the same way.
    const note = await added(ann, 'Character', 'MaxWalkSpeed', '<p>plain</p>');
    const edited = await edit(ann, note.id, { body: body('<p onclick="x()">fresh <a href="javascript:alert(1)">link</a><script>alert(1)</script></p>') });
    assert.equal((edited.body.data as KeyNotes).notes[0].body, '<p>fresh link</p>');
    break;
  }

  case 'hidden-keys': {
    const ann = await signIn('Ann'), operator = await signIn('Olive', OPERATOR_ID);
    const shown = await added(ann, 'Character', 'MaxWalkSpeed', '<p>shown</p>');
    // Notes on keys this schema lacks: a retired key, and a key of the other database.
    const insert = (database: string, key: string) => platformStore().get<{ id: number }>(
      'INSERT INTO notes (database_name, key_name, author_id, body, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id', database, key, ann.userId, '<p>hidden</p>', T0,
    )!.id;
    const hidden = [insert('Character', 'RetiredKey'), insert('Weapon', 'MaxWalkSpeed'), insert('Character', 'Windup')];
    // They are not shown, and cannot be edited or deleted, by their author or the operator.
    for (const viewer of [ann, operator]) {
      const notes = await list(viewer);
      assert.deepEqual(Object.keys(notes.Character), ['MaxWalkSpeed']);
      assert.deepEqual(notes.Character.MaxWalkSpeed.map(note => note.id), [shown.id]);
      assert.deepEqual(notes.Weapon, {});
      for (const id of hidden) {
        assert.equal((await edit(viewer, id, { body: '<p>changed</p>' })).status, 404);
        assert.equal((await remove(viewer, id)).status, 404);
      }
    }
    // Nor is a Note added to one.
    assert.equal((await add(ann, { database: 'Character', key: 'RetiredKey', body: '<p>new</p>' })).status, 400);
    // They are kept as stored, should the key return.
    assert.deepEqual(platformStore().all<{ key_name: string; body: string }>('SELECT key_name, body FROM notes WHERE id IN (?, ?, ?) ORDER BY id', ...hidden),
      [{ key_name: 'RetiredKey', body: '<p>hidden</p>' }, { key_name: 'MaxWalkSpeed', body: '<p>hidden</p>' }, { key_name: 'Windup', body: '<p>hidden</p>' }]);
    break;
  }

  case 'former-owner': {
    const ann = await signIn('Ann'), bob = await signIn('Bob'), operator = await signIn('Olive', OPERATOR_ID);
    const first = await added(ann, 'Character', 'MaxWalkSpeed', '<p>Ann wrote this</p>');
    const second = await added(ann, 'Weapon', 'Windup', '<p>And this</p>');
    // Deleting a server owner (online-platform#37) keeps their Notes, with no author.
    platformStore().run('DELETE FROM users WHERE id = ?', ann.userId);
    const former = (note: NoteView, canDelete: boolean): NoteView => ({ ...note, author: 'a former server owner', canEdit: false, canDelete });
    assert.deepEqual(await list(bob), { Character: { MaxWalkSpeed: [former(first, false)] }, Weapon: { Windup: [former(second, false)] } });
    assert.equal((await edit(bob, first.id, { body: '<p>mine now</p>' })).status, 403);
    assert.equal((await remove(bob, first.id)).status, 403);
    // The operator may delete one.
    assert.deepEqual((await list(operator)).Character.MaxWalkSpeed, [former(first, true)]);
    assert.equal((await edit(operator, first.id, { body: '<p>mine now</p>' })).status, 403);
    console.log(JSON.stringify({ step: 'operator deletes a former server owner\'s Note' }));
    assert.equal((await remove(operator, first.id)).status, 200);
    assert.deepEqual(await list(bob), { Character: {}, Weapon: { Windup: [former(second, false)] } });
    break;
  }

  default:
    throw new Error(`Unknown scenario ${scenario}`);
}

console.log(JSON.stringify({ fixture: { scenario, secrets: [...secrets] } }));
