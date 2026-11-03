import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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

test('feature review harness keeps its platform database in its own temp root and removes it', async () => {
  // A stand-in for a real platform database, which the fixture must not touch.
  const realData = await mkdtemp(join(tmpdir(), 'ezconfig-harness-real-'));
  try {
    const saved = 'a stand-in, not a database';
    await writeFile(join(realData, 'platform.db'), saved);
    const child = Bun.spawn([process.execPath, 'run', 'tests/fixtures/feature-review-harness-check.ts'], {
      cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe',
      env: { ...process.env, DATABASE_PATH: join(realData, 'platform.db') },
    });
    const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: '' });
    expect(await readFile(join(realData, 'platform.db'), 'utf8')).toBe(saved);
    expect(await readdir(realData, { recursive: true })).toEqual(['platform.db']);

    // What the app resolved inside the review: the database in one temp root, removed afterwards.
    const storage = JSON.parse(stdout.split('\n').find(line => line.startsWith('STORAGE '))!.slice('STORAGE '.length));
    const temp = dirname(storage.platform);
    expect(dirname(temp)).toBe(resolve(tmpdir()));
    expect(existsSync(temp)).toBe(false);
  } finally {
    await rm(realData, { recursive: true, force: true });
  }
});
