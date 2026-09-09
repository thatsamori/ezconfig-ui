// Run with: node .scratch/movement-ui/verify.cjs <directory containing playwright>
const { createServer } = require('node:http');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { tmpdir } = require('node:os');
const { resolve, join, sep } = require('node:path');
const { chromium } = require(join(process.argv[2], 'playwright'));
const assert = require('node:assert/strict');
const parent = resolve(tmpdir());
const root = mkdtempSync(join(parent, 'ezconfig-movement-ui-'));
let server;
(async () => {
  let browser;
  try {
    const bundle = join(root, 'app.js');
    const build = spawnSync('bun', ['build', join(__dirname, 'harness.tsx'), '--outfile', bundle, '--target', 'browser'], {
      cwd: resolve(__dirname, '../..'), encoding: 'utf8', windowsHide: true,
    });
    assert.equal(build.status, 0, build.stderr);
    const js = readFileSync(bundle);
    server = createServer((request, response) => {
      if (request.url.startsWith('/api/notes/')) {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ success: true, data: {} }));
        return;
      }
      response.setHeader('Content-Type', request.url === '/app.js' ? 'text/javascript' : 'text/html');
      response.end(request.url === '/app.js' ? js : '<!doctype html><html><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(10000);
    await page.goto('http://127.0.0.1:' + server.address().port);
    for (const kind of ['console', 'row']) {
      const editor = page.getByTestId(kind);
      const state = async () => JSON.parse(await editor.getByTestId('state').innerText());
      const open = () => kind === 'console'
        ? editor.getByRole('button', { name: 'Game default', exact: true }).click()
        : editor.getByTitle('Customize value', { exact: true }).click();
      const reset = () => kind === 'console'
        ? editor.getByRole('button', { name: 'Reset MaxWalkSpeed to game default' }).click()
        : editor.getByTitle('Reset to game default', { exact: true }).click();
      assert(!(await editor.innerText()).includes('varies by motion'));
      await open();
      assert.deepEqual(await state(), { value: null, writes: 0 });
      assert(await editor.getByRole('button', { name: 'Use value' }).isDisabled());
      await editor.getByLabel('MaxWalkSpeed override').fill('450');
      await editor.getByRole('heading').click();
      assert.deepEqual(await state(), { value: null, writes: 0 }, 'typing and blur cannot save a draft');
      await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.deepEqual(await state(), { value: null, writes: 0 });
      await open();
      await editor.getByLabel('MaxWalkSpeed override').fill('-100');
      await editor.getByLabel('MaxWalkSpeed override').press('Escape');
      assert.deepEqual(await state(), { value: null, writes: 0 });
      await open();
      await editor.getByLabel('MaxWalkSpeed override').fill('0');
      await editor.getByLabel('MaxWalkSpeed override').press('Enter');
      assert.deepEqual(await state(), { value: 0, writes: 1 });
      await reset();
      assert.deepEqual(await state(), { value: null, writes: 2 });
      await open();
      await editor.getByLabel('MaxWalkSpeed override').fill('-100');
      await editor.getByRole('button', { name: 'Use value' }).click();
      assert.deepEqual(await state(), { value: -100, writes: 3 });
      await reset();
      assert.deepEqual(await state(), { value: null, writes: 4 });
      console.log(`PASS ${kind}: Game default, Customize, blank draft, typing, blur, Cancel, Escape, Enter zero, Use value negative, Reset`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server?.close();
    const target = resolve(root);
    assert(target.startsWith(parent + sep) && target.slice(parent.length + 1).startsWith('ezconfig-movement-ui-'));
    rmSync(target, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
