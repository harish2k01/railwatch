import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const url=process.env.E2E_URL??'http://127.0.0.1:3102';
assert.equal(process.env.RUN_E2E,'1');
assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname)&&new URL(process.env.DATABASE_URL).pathname.endsWith('_test'));
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL??(process.env.CI?undefined:'chrome'),headless:true});
const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(30000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
const api=async(path,method='get',data)=>context.request[method](url+path,{headers:{Origin:url,Cookie:(await context.cookies()).map(c=>`${c.name}=${c.value}`).join('; ')},data});
try{
  assert.equal((await api('/api/auth/signup','post',{name:'Document Reviewer',email:`reader-${randomUUID()}@example.invalid`,password:'RailWatchReader!2026'})).status(),201);
  const sheet=await context.newPage();await sheet.setContent('<main style="font:24px sans-serif"><h1>RailWatch searchable ticket</h1><p>Madurai to Chennai</p><div style="break-before:page">Second page original</div></main>');
  const bytes=await sheet.pdf({format:'A4'});await sheet.close();
  const id=randomUUID(),date=new Date(Date.now()+20*86400000).toISOString().slice(0,10);
  assert.equal((await context.request.put(url+'/api/railwatch/files/'+id,{headers:{Origin:url,Cookie:(await context.cookies()).map(c=>`${c.name}=${c.value}`).join('; '),'Content-Type':'application/pdf','x-file-name':'synthetic-reader.pdf'},data:bytes})).status(),200);
  let state=(await(await api('/api/railwatch/workspace')).json()).data;
  state.planner.journeys=[{id:'reader',from:'MDU',to:'MS',date,departure:'20:00',train:'',pnr:'',travelClass:'',windowDays:60,originOffset:0,status:'booked',notes:'',attachments:[{id,name:'synthetic-reader.pdf',type:'application/pdf',size:bytes.length,createdAt:new Date().toISOString()}]}];
  assert.equal((await api('/api/railwatch/workspace','put',state)).status(),200);
  for(const theme of ['light','dark']){
    state=(await(await api('/api/railwatch/workspace')).json()).data;state.planner.settings.theme=theme;assert.equal((await api('/api/railwatch/workspace','put',state)).status(),200);
    for(const width of [390,1482]){
      await page.setViewportSize({width,height:844});await page.goto(url+'/tickets');await page.getByRole('button',{name:/^View ticket/}).first().click();
      const dialog=page.getByRole('dialog',{name:'Ticket',exact:true});await expect(dialog.locator('canvas[data-rendered-page="1"]')).toBeVisible();
      await expect(dialog.getByLabel('Page number',{exact:true})).toHaveAttribute('max','2');await dialog.getByLabel('Page number',{exact:true}).fill('1.5');await expect(dialog.getByLabel('Page number',{exact:true})).toHaveValue('1');
      await expect(dialog.locator('.textLayer').first()).toContainText('RailWatch searchable ticket');
      const before=await dialog.locator('.page').first().boundingBox();await dialog.getByRole('button',{name:'Zoom in',exact:true}).click();await expect.poll(async()=>(await dialog.locator('.page').first().boundingBox()).width).toBeGreaterThan(before.width);
      await dialog.getByRole('button',{name:'Find in ticket',exact:true}).click();await dialog.getByRole('searchbox',{name:'Find in document'}).fill('searchable');await expect(dialog.getByText('1 of 1',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Close search',exact:true}).click();
      await dialog.getByRole('button',{name:'Document actions',exact:true}).click();await dialog.getByRole('menuitem',{name:'Fit Width',exact:true}).click();
      if(width>600){const full=(await dialog.locator('.page').first().boundingBox()).width;await dialog.getByRole('button',{name:'Toggle page thumbnails',exact:true}).click();await expect(dialog.getByRole('complementary',{name:'Page thumbnails'})).toBeVisible();await expect.poll(async()=>(await dialog.locator('.page').first().boundingBox()).width).toBeLessThan(full);await dialog.getByRole('button',{name:'Toggle page thumbnails',exact:true}).click();}
      await dialog.locator('.page').last().scrollIntoViewIfNeeded();await expect(dialog.locator('.page').last().locator('canvas')).toHaveAttribute('data-rendered-page','2');
      assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Reader owns horizontal zoom scrolling');
      await dialog.getByLabel('Page number',{exact:true}).fill('1');await expect(dialog.locator('.textLayer').first()).toContainText('RailWatch searchable ticket');await page.screenshot({path:`build/railwatch-qa/reader-${width}-${theme}.png`,animations:'disabled'});
      await dialog.getByRole('button',{name:width<600?'Back':'Close Dialog',exact:true}).click();
      await page.goto(url+'/journeys');await page.getByRole('button',{name:'New Journey',exact:true}).click();
      const form=page.getByRole('dialog');await expect(form.getByLabel('Travel Date',{exact:true})).toHaveValue('');await form.getByRole('button',{name:'Tatkal',exact:true}).click();await expect(form.getByText('Choose a travel date to see when booking opens.')).toBeVisible();await form.getByRole('button',{name:'Normal',exact:true}).click();
      await form.getByLabel('From',{exact:true}).fill('MDU');await form.getByLabel('To',{exact:true}).fill('MS');await form.getByRole('button',{name:'Swap route',exact:true}).click();await expect(form.getByLabel('From',{exact:true})).toHaveValue('MS');
      assert.ok((await form.boundingBox()).width<700,'Create journey remains compact');await page.screenshot({path:`build/railwatch-qa/create-${width}-${theme}.png`,animations:'disabled'});await form.getByRole('button',{name:width<600?'Back':'Close Dialog',exact:true}).click();
    }
  }
  assert.deepEqual(errors,[]);console.log('Passed: continuous searchable PDF reader, real zoom, text layer, page scrolling, compact creation, empty dates, route swap, mobile and both themes.');
}finally{await browser.close();}
