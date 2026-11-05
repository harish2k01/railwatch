import {chromium} from '@playwright/test';
import {expect} from './browser-expect.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const url=process.env.E2E_URL??'http://127.0.0.1:3102';
assert.equal(process.env.RUN_E2E,'1');
assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname)&&new URL(process.env.DATABASE_URL).pathname.endsWith('_test'));
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL??(process.env.CI?undefined:'chrome'),headless:true});
const context=await browser.newContext();
// Exercise manual installation guidance without opening a native install prompt.
await context.addInitScript(()=>window.addEventListener('beforeinstallprompt',event=>event.stopImmediatePropagation(),{capture:true}));
const page=await context.newPage();page.setDefaultTimeout(30000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
const api=async(path,method='get',data)=>context.request[method](url+path,{headers:{Origin:url,Cookie:(await context.cookies()).map(c=>`${c.name}=${c.value}`).join('; ')},data});
try{
  assert.equal((await api('/api/auth/signup','post',{name:'Document Reviewer',email:`reader-${randomUUID()}@example.invalid`,password:'RailWatchReader!2026'})).status(),201);
  // Reproduce the reported sparse-attention layout with four trips and four openings.
  const homeOriginal=(await(await api('/api/railwatch/workspace')).json()).data;
  await page.goto(url+'/');await page.getByRole('heading',{name:'Do next',exact:true}).waitFor();await page.screenshot({path:'build/railwatch-qa/dashboard-empty.png',animations:'disabled'});
  const ahead=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
  const trip=(id,status,n)=>({id,from:'MDU',to:'MS',date:ahead(n),departure:'20:00',train:'',pnr:'',travelClass:'',windowDays:60,originOffset:0,status,notes:''});
  for(const theme of ['light','dark']){const home=(await(await api('/api/railwatch/workspace')).json()).data;home.planner.settings.theme=theme;home.planner.journeys=[trip('cancel-pending','cancellation_needed',2),...[9,11,16,18].map((n,i)=>trip('confirmed-'+i,'booked',n)),...[70,72,77,79].map((n,i)=>trip('planned-'+i,'needs_booking',n))];assert.equal((await api('/api/railwatch/workspace','put',home)).status(),200);for(const width of [1440,1920]){await page.setViewportSize({width,height:1080});await page.goto(url+'/');await page.getByRole('heading',{name:'This week',exact:true}).waitFor();const bookings=await page.locator('section').filter({has:page.getByRole('heading',{name:'Do next',exact:true})}).boundingBox(),week=await page.locator('section').filter({has:page.getByRole('heading',{name:'This week',exact:true})}).boundingBox();assert.ok(week.x>bookings.x+bookings.width,'This week sits in the right-hand column beside Do next');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Dashboard fits viewport');await page.screenshot({path:'build/railwatch-qa/dashboard-gap-'+width+'-'+theme+'.png',animations:'disabled'});}}
  homeOriginal.revision=(await(await api('/api/railwatch/workspace')).json()).data.revision;assert.equal((await api('/api/railwatch/workspace','put',homeOriginal)).status(),200);
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
      await page.setViewportSize({width,height:844});await page.goto(url+'/tickets');
      if(width>600){
        await expect(page.getByRole('heading',{name:'Tickets',exact:true})).toBeVisible();
        const search=page.getByLabel('Search tickets',{exact:true}),reload=page.getByRole('button',{name:'Refresh tickets',exact:true});
        await expect(reload).toBeVisible();
        await expect(page.getByRole('article').first()).toBeVisible({timeout:30000});
        await expect.poll(async()=>{const toolbar=await search.locator('..').boundingBox(),card=await page.getByRole('article').first().boundingBox();return card.y-toolbar.y-toolbar.height;}).toBeGreaterThanOrEqual(15);
        assert.ok((await reload.boundingBox()).height>=44,'Reload has a full control target');
        await page.screenshot({path:'build/railwatch-qa/vault-consistency-'+theme+'.png',animations:'disabled'});
        const primaryStyle=await page.getByRole('button',{name:'New journey',exact:true}).evaluate(el=>({background:getComputedStyle(el).backgroundColor,weight:getComputedStyle(el).fontWeight}));
        await page.goto(url+'/journeys');
        await expect(page.getByRole('button',{name:/^Open journey/}).first()).toBeVisible();
        const controls=[page.getByRole('button',{name:'New journey',exact:true}),page.getByRole('button',{name:'Select travel date range',exact:true}),page.getByRole('combobox',{name:'Sort journeys',exact:true})];
        const sizes=await Promise.all(controls.map(control=>control.evaluate(el=>({height:el.getBoundingClientRect().height,font:getComputedStyle(el).fontSize}))));
        assert.ok(sizes.every(size=>size.height>=44&&size.height<46&&size.font==='14px'),'Equivalent desktop controls share height and type size: '+JSON.stringify(sizes));
        assert.equal(await page.getByRole('heading',{name:'Journeys',exact:true}).evaluate(el=>getComputedStyle(el).fontWeight),'800');
        assert.deepEqual(await controls[0].evaluate(el=>({background:getComputedStyle(el).backgroundColor,weight:getComputedStyle(el).fontWeight})),primaryStyle,'Primary actions share theme colour and weight across pages');
        await page.screenshot({path:'build/railwatch-qa/journeys-consistency-'+theme+'.png',animations:'disabled'});await page.goto(url+'/tickets');
      }
      await page.getByRole('button',{name:/^View ticket/}).first().click();
      const dialog=page.getByRole('dialog',{name:'Ticket',exact:true});await expect(dialog.locator('canvas[data-rendered-page="1"]')).toBeVisible();
      const viewport=dialog.getByLabel('Ticket document',{exact:true});
      await expect.poll(()=>viewport.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
      await expect(dialog.getByLabel('Page number',{exact:true})).toHaveAttribute('max','2');await dialog.getByLabel('Page number',{exact:true}).fill('1.5');await expect(dialog.getByLabel('Page number',{exact:true})).toHaveValue('1');
      await expect(dialog.locator('.textLayer').first()).toContainText('RailWatch searchable ticket');
      const before=await dialog.locator('.page').first().boundingBox();await dialog.getByRole('button',{name:'Zoom in',exact:true}).click();await expect.poll(async()=>(await dialog.locator('.page').first().boundingBox()).width).toBeGreaterThan(before.width);
      await expect.poll(()=>viewport.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeGreaterThan(1);
      await dialog.getByRole('button',{name:'Find in ticket',exact:true}).click();await dialog.getByRole('searchbox',{name:'Find in document'}).fill('searchable');await expect(dialog.getByText('1 of 1',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Close search',exact:true}).click();
      await dialog.getByRole('button',{name:'Document actions',exact:true}).click();await dialog.getByRole('menuitem',{name:'Fit width',exact:true}).click();
      if(width>600){const full=(await dialog.locator('.page').first().boundingBox()).width;await dialog.getByRole('button',{name:'Toggle page thumbnails',exact:true}).click();await expect(dialog.getByRole('complementary',{name:'Page thumbnails'})).toBeVisible();await expect.poll(async()=>(await dialog.locator('.page').first().boundingBox()).width).toBeLessThan(full);await dialog.getByRole('button',{name:'Toggle page thumbnails',exact:true}).click();}
      await dialog.locator('.page').last().scrollIntoViewIfNeeded();await expect(dialog.locator('.page').last().locator('canvas')).toHaveAttribute('data-rendered-page','2');
      await expect.poll(()=>viewport.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
      assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Reader owns horizontal zoom scrolling');
      await dialog.getByLabel('Page number',{exact:true}).fill('1');await expect(dialog.locator('.textLayer').first()).toContainText('RailWatch searchable ticket');await page.screenshot({path:`build/railwatch-qa/reader-${width}-${theme}.png`,animations:'disabled'});
      await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();
      await page.goto(url+'/journeys');await page.getByRole('button',{name:/^Open journey/}).first().click();
      await page.getByRole('dialog').getByRole('button',{name:'More journey actions',exact:true}).click();await page.getByRole('dialog').getByRole('menuitem',{name:'Edit journey',exact:true}).click();
      const ticketEditor=page.getByRole('dialog');await expect(ticketEditor.locator('[data-ticket-details]')).not.toHaveAttribute('open','');await expect(ticketEditor.getByLabel('PNR',{exact:true})).toBeHidden();await page.screenshot({path:'build/railwatch-qa/ticket-details-'+width+'-'+theme+'.png',animations:'disabled'});await ticketEditor.locator('[data-ticket-details]>summary').click();await expect(ticketEditor.getByLabel('PNR',{exact:true})).toBeVisible();await ticketEditor.getByRole('button',{name:'Close dialog',exact:true}).click();
      if(width>600){await page.goto(url+'/settings');await page.getByRole('button',{name:'Install RailWatch',exact:true}).click();const install=page.getByRole('dialog',{name:'Install RailWatch',exact:true});const title=install.getByRole('heading',{name:'Install RailWatch',exact:true});await expect(title).toBeVisible();const box=await title.boundingBox();assert.ok(box.width>130&&box.height<65,'Install title remains readable instead of wrapping vertically');await page.screenshot({path:'build/railwatch-qa/install-help-'+theme+'.png',animations:'disabled'});await install.getByRole('button',{name:'Close dialog',exact:true}).click();}
      await page.goto(url+'/journeys');await page.getByRole('button',{name:'New journey',exact:true}).click();
      const form=page.getByRole('dialog');await expect(form.getByLabel('Travel date',{exact:true})).toHaveValue('');await form.getByRole('combobox',{name:'Quota',exact:true}).click();await form.getByRole('option',{name:'Tatkal · AC (10:00)',exact:true}).click();await expect(form.getByText('Choose a travel date to see when booking opens.')).toBeVisible();await form.getByRole('combobox',{name:'Quota',exact:true}).click();await form.getByRole('option',{name:'Normal',exact:true}).click();
      await form.getByLabel('From',{exact:true}).fill('MDU');await form.getByLabel('To',{exact:true}).fill('MS');await form.getByRole('button',{name:'Swap route',exact:true}).click();await expect(form.getByLabel('From',{exact:true})).toHaveValue('MS');
      assert.ok((await form.boundingBox()).width<=(width>1000?980:width)+1,'Create journey stays within the board width (980px two-pane on desktop) and the screen');await page.screenshot({path:`build/railwatch-qa/create-${width}-${theme}.png`,animations:'disabled'});await form.getByRole('button',{name:'Close dialog',exact:true}).click();
    }
  }
  assert.deepEqual(errors,[]);console.log('Passed: continuous searchable PDF reader, real zoom, text layer, page scrolling, compact creation, empty dates, route swap, mobile and both themes.');
}finally{await browser.close();}
