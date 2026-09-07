const {createServer}=require('node:http');
const {readFileSync}=require('node:fs');
const {chromium}=require(process.argv[2]+'/playwright');
const assert=require('node:assert/strict');
const js=readFileSync(__dirname+'/app.js');
const server=createServer((req,res)=>{
  res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':'text/html');
  res.end(req.url==='/app.js'?js:'<!doctype html><html><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try {
    browser=await chromium.launch({headless:true,channel:'msedge'});
    const page=await browser.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror',e=>console.log('page error:',e.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    const state=async()=>JSON.parse(await page.getByTestId('state').innerText());
    const open=()=>page.getByRole('button',{name:'Game default — varies by motion'}).click();
    await open();
    assert.deepEqual(await state(),{value:null,writes:0});
    await page.getByLabel('StrikeFeintWindow override').fill('0');
    await page.getByRole('heading').click();
    assert.deepEqual(await state(),{value:null,writes:0});
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.deepEqual(await state(),{value:null,writes:0});
    await open();
    await page.getByLabel('StrikeFeintWindow override').fill('-0.65');
    await page.getByLabel('StrikeFeintWindow override').press('Escape');
    assert.deepEqual(await state(),{value:null,writes:0});
    await open();
    assert(await page.getByRole('button',{name:'Use value'}).isDisabled());
    await page.getByLabel('StrikeFeintWindow override').fill('0');
    await page.getByLabel('StrikeFeintWindow override').press('Enter');
    assert.deepEqual(await state(),{value:0,writes:1});
    await page.getByRole('button',{name:'Reset StrikeFeintWindow to game default'}).click();
    assert.deepEqual(await state(),{value:null,writes:2});
    console.log('PASS browser: Customize/typing/blur/Cancel/Escape preserve omission; blank blocked; Enter saves zero; Reset removes override');
  } finally {await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
