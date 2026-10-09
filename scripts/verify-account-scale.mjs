import assert from 'node:assert/strict';
import {expect} from '@playwright/test';

/** Exercise bounded lists and edits beyond the first page without losing existing plans. */
export async function verifyAccountScale({page,api,url}) {
  const baseline=(await (await api('/api/railwatch/workspace')).json()).data;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());
  const targetDay=new Date(Date.parse(today+'T00:00:00Z')+90*86400000).toISOString().slice(0,10);
  const journeys=Array.from({length:210},(_,i)=>({id:`scale-ui-${i}`,from:`ScaleOrigin${i}`,to:'ScaleDestination',date:targetDay,departure:'20:00',train:'',travelClass:'',windowDays:60,originOffset:0,status:'needs_booking',pnr:'',notes:'Preserve this record'}));
  if(baseline.planner.rules.length)journeys[0]={...journeys[0],ruleId:baseline.planner.rules[0].id,status:'booked'};
  try {
    assert.equal((await api('/api/railwatch/workspace','put',{...baseline,planner:{...baseline.planner,journeys:[...baseline.planner.journeys,...journeys]}})).status(),200);
    const partial=(await (await api('/api/railwatch/workspace?partial=1')).json()).data;
    assert.equal(partial.partial,true);assert.equal(partial.planner.journeys.length,0);
    await page.goto(url+'/journeys');
    const column=page.getByRole('region',{name:'Planned column',exact:true});
    await expect(column.getByRole('article')).toHaveCount(30);
    await column.getByRole('button',{name:'Load more planned',exact:true}).click();
    await expect(column.getByRole('article')).toHaveCount(60);
    await page.getByRole('textbox',{name:'Search Journeys',exact:true}).fill('ScaleOrigin209');
    await expect(column.getByRole('article')).toHaveCount(1);
    await column.getByRole('button',{name:/Open journey/}).click();
    const dialog=page.getByRole('dialog');
    await dialog.getByLabel('Notes',{exact:true}).fill('Edited beyond the first page');
    await dialog.getByRole('button',{name:/^Save journey$/i}).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(async()=>((await (await api('/api/railwatch/workspace')).json()).data.planner.journeys.find(j=>j.id==='scale-ui-209')?.notes)).toBe('Edited beyond the first page');
    const saved=(await (await api('/api/railwatch/workspace')).json()).data;
    for(const journey of journeys)assert.equal(saved.planner.journeys.find(j=>j.id===journey.id)?.notes,journey.id==='scale-ui-209'?'Edited beyond the first page':'Preserve this record');
    for(const journey of baseline.planner.journeys)assert.ok(saved.planner.journeys.some(j=>j.id===journey.id));
    await page.getByRole('textbox',{name:'Search Journeys',exact:true}).fill('');
    await expect(column.getByRole('article')).toHaveCount(30);
    await page.screenshot({path:'build/railwatch-qa/account-scale-board.png',animations:'disabled'});
    const dashboard=(await (await api('/api/railwatch/views?view=dashboard')).json()).data;
    assert.equal(dashboard.totals.booked,saved.planner.journeys.filter(j=>!j.archivedAt&&j.status==='booked'&&j.date>=today).length);
    assert.ok(dashboard.upcoming.length<=4&&dashboard.bookingSoon.length<=4&&dashboard.attention.length<=30);
    const calendar=(await (await api(`/api/railwatch/views?view=calendar&from=${targetDay}&to=${targetDay}`)).json()).data;
    assert.equal(calendar.journeys.length,200);assert.ok(calendar.counts[targetDay].journeys>=210);assert.ok(calendar.nextCursor);
    await page.goto(url+'/calendar');
    const months=(Number(targetDay.slice(0,4))-Number(today.slice(0,4)))*12+Number(targetDay.slice(5,7))-Number(today.slice(5,7));
    await expect(page.getByRole('button',{name:'Next Month',exact:true})).toBeVisible();
    for(let i=0;i<months;i++){await page.getByRole('button',{name:'Next Month',exact:true}).click();const expectedMonth=new Date(`${today.slice(0,7)}-01T00:00:00Z`);expectedMonth.setUTCMonth(expectedMonth.getUTCMonth()+i+1);await expect(page.getByRole('heading',{name:new Intl.DateTimeFormat('en-IN',{month:'long',year:'numeric',timeZone:'UTC'}).format(expectedMonth),exact:true})).toBeVisible();}
    await page.getByRole('button',{name:new RegExp(`^View ${targetDay},`)}).click();
    await expect(dialog.getByRole('button',{name:'Load more day events',exact:true})).toBeVisible();
    await dialog.getByRole('button',{name:'Load more day events',exact:true}).click();
    await expect(dialog.getByRole('button',{name:/^ScaleOrigin/})).toHaveCount(210);
    await dialog.getByRole('button',{name:'Close Dialog',exact:true}).click();
    // The phone screens must retain pagination beyond their compact initial lists.
    await page.setViewportSize({width:390,height:844});await page.goto(url+'/journeys');
    await page.getByRole('button',{name:'Planned',exact:true}).click();
    await page.getByLabel('Search Journeys',{exact:true}).fill('ScaleOrigin');
    const mobileRows=page.getByRole('button',{name:/^Open journey ScaleOrigin/});
    await expect(mobileRows).toHaveCount(30);
    await page.getByRole('button',{name:'Load more to book',exact:true}).click();await expect(mobileRows).toHaveCount(60);
    await page.goto(url+'/calendar');await page.getByLabel('Choose date',{exact:true}).fill(targetDay);
    await expect(mobileRows).toHaveCount(200);
    await page.getByRole('button',{name:'Load more day events',exact:true}).click();await expect(mobileRows).toHaveCount(210);
    await page.screenshot({path:'build/railwatch-qa/mobile-scale-agenda.png',animations:'disabled'});
    await page.setViewportSize({width:1482,height:876});
    await page.goto(url+'/routines');
    if(baseline.planner.rules.length){
      const rule=baseline.planner.rules[0];
      await page.getByRole('button',{name:`Actions For ${rule.name}`,exact:true}).click();
      await page.getByRole('menuitem',{name:rule.paused?'Resume Routine':'Pause Routine',exact:true}).click();
      await expect.poll(async()=>((await (await api('/api/railwatch/workspace')).json()).data.planner.rules.find(r=>r.id===rule.id)?.paused)).toBe(!rule.paused);
      const after=(await (await api('/api/railwatch/workspace')).json()).data;
      for(const journey of baseline.planner.journeys.filter(j=>j.status==='booked'||j.manualOverride))assert.ok(after.planner.journeys.some(j=>j.id===journey.id));
      assert.equal(after.planner.journeys.filter(j=>j.id.startsWith('scale-ui-')).length,210);
      assert.equal(after.planner.journeys.find(j=>j.id==='scale-ui-0').status,'booked');
      assert.equal((await api('/api/railwatch/routines','post',{action:'remove',id:rule.id,revision:saved.revision})).status(),409);
      const removed=await api('/api/railwatch/routines','post',{action:'remove',id:rule.id,revision:after.revision});assert.equal(removed.status(),200);assert.equal((await removed.json()).data.planner.journeys.length,0);
      const retained=(await (await api('/api/railwatch/workspace')).json()).data;
      assert.equal(retained.planner.journeys.find(j=>j.id==='scale-ui-0').status,'booked');
    }
  } finally {
    const current=(await (await api('/api/railwatch/workspace')).json()).data;
    assert.equal((await api('/api/railwatch/workspace','put',{planner:baseline.planner,revision:current.revision})).status(),200);
  }
}
