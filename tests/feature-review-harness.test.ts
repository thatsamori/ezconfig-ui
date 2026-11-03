import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

test('feature review harness applies the whole configuration as a wipe then one command per non-empty category', async () => {
  const evidence = await mkdtemp(join(tmpdir(), 'ezconfig-harness-test-'));
  try {
    const capture = join(evidence, 'movement-ui', 'captured-rcon.json');
    const result = Bun.spawnSync([process.execPath, 'run', 'tests/fixtures/feature-review-harness-check.ts'], {
      cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
      env: { ...process.env, EZ_HARNESS_CHECK_CAPTURE_PATH: capture },
    });
    expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: '' });

    // Every Apply is captured under its stage name, or apply-N, in order; a refused one is not.
    const captured = JSON.parse(await readFile(capture, 'utf8'));
    expect(Object.keys(captured)).toEqual(['empty', 'walk', 'apply-3', 'apply-4', 'cleared']);
    expect(captured.empty).toEqual(['string ezconfig WipeDatabases']);
    expect(captured.walk).toEqual(['string ezconfig WipeDatabases', 'string ezconfig Character Movement {"MaxWalkSpeed":"450.00"}']);
    expect(captured['apply-4'].toSorted()).toEqual([
      'string ezconfig ArmingSword Strike {"Windup":"0.50"}',
      'string ezconfig Character Movement {"TimeToMaxSprint":"0.96"}',
      'string ezconfig WipeDatabases',
    ]);
    expect(captured.cleared).toEqual(['string ezconfig WipeDatabases']);
  } finally {
    await rm(evidence, { recursive: true, force: true });
  }
});

test('feature review harness isolates storage and never opens an RCON connection', async () => {
  // Stand-ins for real data and a real server, which the fixture must not touch.
  const realData = await mkdtemp(join(tmpdir(), 'ezconfig-harness-real-'));
  let connections = 0;
  const server = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { open: () => { connections++; }, data: () => {} } });
  try {
    const saved = JSON.stringify({ MaxWalkSpeed: 1 });
    await mkdir(join(realData, 'Databases', 'Character'), { recursive: true });
    await writeFile(join(realData, 'Databases', 'Character', 'Movement.json'), saved);
    const env = {
      DATABASES_PATH: join(realData, 'Databases'), PRESETS_PATH: join(realData, 'Presets'),
      NOTES_PATH: join(realData, 'Notes'), USERS_PATH: join(realData, 'users.json'),
    };
    const child = Bun.spawn([process.execPath, 'run', 'tests/fixtures/feature-review-harness-check.ts'], {
      cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
      // The harness pins RCON_HOST to 127.0.0.1, where this listener would see any connection.
      env: { ...process.env, ...env, RCON_HOST: 'localhost', RCON_PORT: String(server.port), RCON_PASSWORD: 'not-a-real-password' },
    });
    const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: '' });
    expect(connections).toBe(0);
    expect(await readFile(join(realData, 'Databases', 'Character', 'Movement.json'), 'utf8')).toBe(saved);
    expect((await readdir(realData, { recursive: true })).sort()).toEqual(['Databases', join('Databases', 'Character'), join('Databases', 'Character', 'Movement.json')]);

    // What the app resolved inside the review: all storage in one temp root, removed afterwards.
    const storage = JSON.parse(stdout.split('\n').find(line => line.startsWith('STORAGE '))!.slice('STORAGE '.length));
    expect(storage.rcon).toBe('127.0.0.1');
    const temp = dirname(storage.databases);
    expect(dirname(temp)).toBe(resolve(tmpdir()));
    expect([storage.databases, storage.presets, storage.notes, storage.users].map(path => dirname(path))).toEqual([temp, temp, temp, temp]);
    expect(existsSync(temp)).toBe(false);
  } finally {
    server.stop(true);
    await rm(realData, { recursive: true, force: true });
  }
});
