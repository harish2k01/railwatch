import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { expect } from '@playwright/test';

/** Exercises the populated test account at phone, tablet and desktop widths in both themes. */
export async function verifyResponsive({page,api,url,otherApi}) {
  const curve=createECDH('prime256v1');curve.generateKeys();
  const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/railwatch-isolated-test',keys:{p256dh:curve.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
  assert.equal((await api('/api/railwatch/push','post',{action:'subscribe',subscription})).status(),200);
  assert.equal((await(await api('/api/railwatch/push','post',{action:'status',endpoint:subscription.endpoint})).json()).data.subscribed,true);
  assert.equal((await api('/api/railwatch/push','post',{action:'subscribe',subscription:{...subscription,endpoint:'https://localhost/private'}})).status(),400);
  assert.equal((await otherApi('/api/railwatch/push','post',{action:'subscribe',subscription})).status(),409);
  assert.equal((await otherApi('/api/railwatch/push','post',{action:'test',endpoint:subscription.endpoint})).status(),400);
  assert.equal((await api('/api/railwatch/push','post',{action:'remove',endpoint:subscription.endpoint})).status(),200);
  for (const theme of ['light','dark']) {
    const state=(await(await api('/api/railwatch/workspace')).json()).data;
    state.planner.settings.theme=theme;
    assert.equal((await api('/api/railwatch/workspace','put',state)).status(),200);
    for (const width of [320,390,768,1482]) {
      await page.setViewportSize({width,height:844});
      for (const path of ['/','/journeys','/calendar','/routines','/holidays','/tickets','/admin','/admin/operations','/notifications']) {
        await page.goto(url+path);
        await page.getByRole('heading',{level:1}).waitFor();
        await expect(page.locator('[data-theme]')).toHaveAttribute('data-theme',theme);
        const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
        assert.ok(dimensions.scroll<=dimensions.width+1,`${theme} ${width}px ${path}: document overflows`);
      }
      if(width<=390) {
        await page.goto(url+'/journeys');
        const mobileNav=page.getByRole('navigation',{name:'Mobile navigation'});
        for(const name of ['Home','Journeys','Tickets']) {
          const link=mobileNav.getByRole('link',{name,exact:true});await expect(link).toBeVisible();
          const box=await link.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width,`Mobile ${name} fits`);
        }
        await expect(page.getByRole('region',{name:'Booked column',exact:true})).toHaveCount(0);
        await expect(page.getByRole('button',{name:'Booked',exact:true})).toHaveAttribute('aria-pressed','true');
        if(width===390)await page.screenshot({path:`build/railwatch-qa/mobile-list-${theme}.png`,animations:'disabled'});
        await page.getByRole('button',{name:'Planned',exact:true}).click();
        await expect(page.getByRole('button',{name:'Planned',exact:true})).toHaveAttribute('aria-pressed','true');
        await mobileNav.getByRole('button',{name:'More',exact:true}).click();
        await expect(page.getByRole('heading',{name:'More',exact:true})).toBeVisible();
        const more=page.getByRole('navigation',{name:'More destinations'});
        await more.getByRole('link',{name:'Routines',exact:false}).click();await expect(page.getByRole('heading',{name:'Routines',exact:true})).toBeVisible();
        await page.getByRole('button',{name:'Open Profile Menu',exact:true}).click();await page.getByRole('menuitem',{name:'User Settings',exact:true}).click();
        const drawer=page.getByRole('dialog',{name:'User Settings',exact:true});
        const bounds=await drawer.boundingBox();assert.ok(bounds.width>=width-1,'Settings fills the phone');
        if(width===390){await page.setViewportSize({width:1482,height:876});await expect(page.getByRole('dialog')).toHaveCount(1);await expect(drawer.getByLabel('Username',{exact:true})).toBeVisible();await drawer.getByLabel('Username',{exact:true}).focus();await expect(drawer.getByLabel('Username',{exact:true})).toBeFocused();await page.setViewportSize({width,height:844});await expect(drawer.getByRole('navigation',{name:'Settings sections'})).toBeVisible();}
        for(const tab of await drawer.getByRole('navigation',{name:'Settings sections'}).getByRole('button').all()){const box=await tab.boundingBox();assert.ok(box.x>=bounds.x&&box.x+box.width<=bounds.x+bounds.width+1,'Settings sections fit phone');}
        await drawer.getByRole('button',{name:'Close User Settings',exact:true}).click();
        await page.goto(url+'/journeys');await page.getByRole('button',{name:/Open journey/}).first().click();
        const summary=page.getByRole('dialog');await expect(summary.getByRole('button',{name:'Edit Journey',exact:true})).toBeVisible();await expect(summary.getByRole('textbox')).toHaveCount(0);
        assert.ok((await summary.boundingBox()).width>=width-1,'Journey summary fills phone');
        await summary.getByRole('button',{name:'Close Dialog',exact:true}).click();
        await page.getByRole('button',{name:'Open Profile Menu'}).click();await page.getByRole('menuitem',{name:'User Settings'}).click();await drawer.getByRole('button',{name:'Preferences',exact:true}).click();await expect(drawer.getByRole('heading',{name:'Normal Booking Reminders'})).toBeVisible();
        assert.ok(await drawer.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Custom reminder controls fit mobile');await drawer.getByRole('button',{name:'Close User Settings',exact:true}).click();

        await page.getByRole('button',{name:/^Notifications/}).click();
        const inbox=page.getByRole('region',{name:'Notifications',exact:true});
        const panel=await inbox.boundingBox();assert.ok(panel.x>=0&&panel.x+panel.width<=width,'Notification inbox fits phone');
        await inbox.getByRole('button',{name:/Close/}).click();
        if(width===390&&theme==='light') {
          await mobileNav.getByRole('button',{name:'More',exact:true}).click();
          await page.getByRole('navigation',{name:'More destinations'}).getByRole('button',{name:'User Settings',exact:false}).click();
          await expect(drawer.getByRole('navigation',{name:'Settings sections'})).toBeVisible();
          await drawer.getByRole('button',{name:'Close User Settings',exact:true}).click();
          await mobileNav.getByRole('link',{name:'Tickets',exact:true}).click();
          const ticketRow=page.getByRole('button',{name:/^View ticket/}).first();await ticketRow.click();
          const pdf=page.getByRole('dialog',{name:'Ticket',exact:true});
          await expect(pdf.locator('canvas[data-rendered-page="1"]')).toBeVisible();
          await pdf.getByRole('button',{name:'Zoom in',exact:true}).click();
          assert.ok(await pdf.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Zoom stays within PDF scroll surface');
          await pdf.getByRole('button',{name:'Fit Width',exact:true}).click();
          await pdf.getByRole('button',{name:'Back',exact:true}).click();
          await page.getByRole('button',{name:/^Ticket Actions For/}).first().click();await page.getByRole('menuitem',{name:'Journey details',exact:true}).click();await expect(summary.getByRole('button',{name:'Edit Journey',exact:true})).toBeVisible();await summary.getByRole('button',{name:'Back',exact:true}).click();
          await mobileNav.getByRole('link',{name:'Journeys',exact:true}).click();
          await page.getByRole('button',{name:/Open journey/}).first().click();
          await summary.getByRole('button',{name:'Edit Journey',exact:true}).click();
          await summary.getByLabel('Notes',{exact:true}).fill('Saved from the dedicated mobile editor');
          await summary.getByRole('button',{name:'Save journey',exact:true}).click();
          await expect(summary).toHaveCount(0);
          const stored=(await(await api('/api/railwatch/workspace')).json()).data;
          assert.ok(stored.planner.journeys.some(j=>j.notes==='Saved from the dedicated mobile editor'),'Mobile edit persisted');
          await page.getByRole('button',{name:/Open journey/}).first().click();
          await summary.getByRole('button',{name:'Edit Journey',exact:true}).click();
          await summary.getByLabel('Notes',{exact:true}).fill('Unsaved mobile edit');
          page.removeAllListeners('dialog');let guarded=false;page.on('dialog',async d=>{guarded=true;await d.dismiss();});
          await summary.getByRole('button',{name:'Back',exact:true}).click();assert.equal(guarded,true);await expect(summary).toBeVisible();
          page.removeAllListeners('dialog');page.on('dialog',d=>d.accept());await summary.getByRole('button',{name:'Back',exact:true}).click();
          await page.getByRole('button',{name:'Journey filters',exact:true}).click();
          await expect(page.getByRole('combobox',{name:'Routine',exact:true})).toBeVisible();
          await page.getByLabel('Search Journeys',{exact:true}).fill('no-such-route-mobile-qa');
          await expect(page.getByText('No journeys in this list.',{exact:true})).toBeVisible();
          await page.getByRole('button',{name:'Clear filters',exact:true}).click();
          await page.getByRole('button',{name:'To cancel',exact:true}).click();
          await page.getByRole('button',{name:/Open journey/}).first().click();
          await summary.getByRole('button',{name:'Confirm Cancellation',exact:true}).click();await expect(summary).toHaveCount(0);
          await page.getByRole('button',{name:'Cancelled',exact:true}).click();await expect(page.getByRole('button',{name:/Open journey/}).first()).toBeVisible();
          await page.locator('[aria-label="Journey lists"]').getByRole('button',{name:'History',exact:true}).click();await expect(page.locator('[aria-label="Journey lists"]').getByRole('button',{name:'History',exact:true})).toHaveAttribute('aria-pressed','true');
          await page.locator('[aria-label="Journey lists"]').getByRole('button',{name:'Archive',exact:true}).click();await expect(page.locator('[aria-label="Journey lists"]').getByRole('button',{name:'Archive',exact:true})).toHaveAttribute('aria-pressed','true');
          await page.goto(url+'/admin');await page.getByRole('navigation',{name:'Administrator settings groups'}).getByRole('button',{name:'Normal booking',exact:true}).click();await expect(page.getByLabel('Booking opens this many days before travel')).toBeVisible();await expect(page.getByLabel('SMTP Connection')).toHaveCount(0);await page.getByRole('button',{name:'Administrator settings',exact:false}).click();await expect(page.getByRole('navigation',{name:'Administrator settings groups'})).toBeVisible();
        }
        await page.goto(url+'/calendar');await expect(page.getByRole('region',{name:'Day agenda',exact:true})).toBeVisible();await expect(page.getByLabel('Choose date',{exact:true})).toBeVisible();
        await page.goto(url+'/');await page.getByRole('heading',{level:1}).waitFor();await expect(page.locator('[data-theme]')).toHaveAttribute('data-theme',theme);await page.screenshot({path:`build/railwatch-qa/mobile-${width}-${theme}.png`,animations:'disabled'});
      }
    }
  }
  await page.setViewportSize({width:390,height:844});await page.goto(url+'/');
  await page.getByRole('button',{name:'Open Profile Menu'}).click();await page.getByRole('menuitem',{name:'User Settings'}).click();
  const guardedSettings=page.getByRole('dialog');await guardedSettings.getByRole('button',{name:'Profile',exact:true}).click();
  const username=guardedSettings.getByRole('textbox',{name:'Username',exact:true}),originalName=await username.inputValue();await username.fill(originalName+' edited');
  page.removeAllListeners('dialog');let settingsWarnings=0;page.on('dialog',async d=>{settingsWarnings++;await d.dismiss();});
  await guardedSettings.getByRole('button',{name:'Close User Settings',exact:true}).click();await expect(username).toHaveValue(originalName+' edited');assert.equal(settingsWarnings,1);
  await guardedSettings.getByRole('button',{name:'← Settings',exact:true}).click();await expect(username).toBeVisible();assert.equal(settingsWarnings,2);
  await page.route('**/api/railwatch/profile',route=>route.request().method()==='PATCH'?route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:{message:'Settings failure fixture'}})}):route.continue());
  await guardedSettings.getByRole('button',{name:'Save Profile',exact:true}).click();await expect(guardedSettings.getByRole('alert')).toContainText('Settings failure fixture');
  await guardedSettings.getByRole('button',{name:'Close User Settings',exact:true}).click();assert.equal(settingsWarnings,3);await expect(username).toHaveValue(originalName+' edited');await page.unroute('**/api/railwatch/profile');
  await username.fill(originalName);await guardedSettings.getByRole('button',{name:'Save Profile',exact:true}).click();await expect(guardedSettings.getByRole('status').filter({hasText:'Your profile has been updated'})).toBeVisible();
  await guardedSettings.getByRole('button',{name:'Close User Settings',exact:true}).click();await expect(guardedSettings).toHaveCount(0);assert.equal(settingsWarnings,3);
  page.removeAllListeners('dialog');page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Open Profile Menu'}).click();await page.getByRole('menuitem',{name:'User Settings'}).click();await guardedSettings.getByRole('button',{name:'Profile',exact:true}).click();await guardedSettings.getByRole('textbox',{name:'Username',exact:true}).fill('Discarded settings fixture');await guardedSettings.getByRole('button',{name:'Close User Settings',exact:true}).click();
  await page.getByRole('button',{name:'Open Profile Menu'}).click();await page.getByRole('menuitem',{name:'User Settings'}).click();await guardedSettings.getByRole('button',{name:'Profile',exact:true}).click();await expect(guardedSettings.getByRole('textbox',{name:'Username',exact:true})).toHaveValue(originalName);await guardedSettings.getByRole('button',{name:'Close User Settings',exact:true}).click();
  page.removeAllListeners('dialog');page.on('dialog',async d=>{settingsWarnings++;await d.dismiss();});
  await page.goto(url+'/admin');await page.getByRole('button',{name:'Normal booking',exact:true}).click();const bookingDays=page.getByRole('spinbutton',{name:'Booking opens this many days before travel',exact:true}),originalDays=await bookingDays.inputValue();await bookingDays.fill('61');
  await page.getByRole('button',{name:'More',exact:true}).click();await expect(bookingDays).toBeVisible();assert.equal(settingsWarnings,4);
  await page.getByRole('button',{name:'← Administrator settings',exact:true}).click();await expect(bookingDays).toBeVisible();assert.equal(settingsWarnings,5);
  await bookingDays.fill(originalDays);await page.getByRole('button',{name:'Save Booking Rules',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Settings saved'})).toBeVisible();await page.getByRole('button',{name:'← Administrator settings',exact:true}).click();assert.equal(settingsWarnings,5);
  page.removeAllListeners('dialog');page.on('dialog',d=>d.accept());
  await page.setViewportSize({width:1482,height:876});
  const state=(await(await api('/api/railwatch/workspace')).json()).data;state.planner.settings.theme='light';assert.equal((await api('/api/railwatch/workspace','put',state)).status(),200);
  await page.goto(url+'/journeys');await page.getByRole('region',{name:'Booked column',exact:true}).getByRole('button',{name:/Open journey/}).first().click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'Edit Journey',exact:true})).toHaveCount(0);await expect(dialog.getByLabel('Notes',{exact:true})).toBeVisible();
  assert.ok((await dialog.boundingBox()).width>1000,'Desktop journey opens directly in editor');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflow),'hidden','Dialog owns scrolling');
  await dialog.getByLabel('Notes',{exact:true}).fill('Discard guard test');
  page.removeAllListeners('dialog');let warned=false;page.on('dialog',async d=>{warned=true;await d.dismiss();});
  await dialog.getByRole('button',{name:'Close Dialog',exact:true}).click();assert.equal(warned,true);await expect(dialog).toBeVisible();
  page.removeAllListeners('dialog');page.on('dialog',d=>d.accept());await dialog.getByRole('button',{name:'Close Dialog',exact:true}).click();await expect(dialog).toHaveCount(0);

  await page.getByRole('button',{name:'New Journey',exact:true}).click();
  await dialog.getByRole('combobox',{name:'Booking type',exact:true}).click();await dialog.getByRole('option',{name:'Tatkal',exact:true}).click();
  await expect(dialog.getByText('10:00 AM IST',{exact:false})).toBeVisible();
  await dialog.getByRole('combobox',{name:'Tatkal class',exact:true}).click();await dialog.getByRole('option',{name:'Non-AC — opens at 11 AM',exact:true}).click();await expect(dialog.getByText('11:00 AM IST',{exact:false})).toBeVisible();
  await dialog.getByRole('button',{name:'Close Dialog',exact:true}).click();
  await page.goto(url+'/journeys');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>{window.viewMotionCalls=[];const original=Element.prototype.animate;Element.prototype.animate=function(frames,options){window.viewMotionCalls.push({frames,options});return original.call(this,frames,options);};});
  await page.getByRole('button',{name:/^History/}).click();
  await expect.poll(()=>page.evaluate(()=>window.viewMotionCalls.length)).toBeGreaterThan(0);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>{window.viewMotionCalls=[];});
  await page.getByRole('button',{name:/^Archive \d/}).click();assert.equal(await page.evaluate(()=>window.viewMotionCalls.length),0);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto(url+'/');await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href','/manifest.webmanifest');
  const manifest=await(await page.request.get(url+'/manifest.webmanifest')).json();assert.equal(manifest.display,'standalone');
  await page.evaluate(()=>navigator.serviceWorker.ready);
  const cache=await page.evaluate(async()=>{const keys=await caches.keys();return Promise.all(keys.filter(key=>key.startsWith('railwatch-')).map(async key=>(await(await caches.open(key)).keys()).map(request=>new URL(request.url).pathname)));});
  assert.deepEqual(cache.flat(),['/offline.html']);
  await page.context().setOffline(true);await page.goto(url+'/journeys');await expect(page.getByRole('heading',{name:'You’re offline',exact:true})).toBeVisible();await page.context().setOffline(false);await page.goto(url+'/');
  console.log('Passed: responsive routes in light/dark themes, dedicated mobile navigation, journey lists, More screen, full-screen settings, day agenda, unsaved-change guard, standalone manifest and offline-only cache.');
}
