import assert from 'node:assert/strict';
import {expect} from '@playwright/test';

/** Exercises the approved desktop workspace against owned server-side date and cursor filters. */
export async function verifyDesktopJourneys(page,api,url){
  const baseline=(await(await api('/api/railwatch/workspace')).json()).data;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const day=offset=>{const date=new Date(today+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);};
  const fixtures=[[2,'booked'],[4,'booked'],[45,'booked'],[60,'needs_booking'],[61,'needs_booking'],[7,'cancellation_needed']].map(([offset,status],i)=>({id:'desktop-window-'+i,from:'AAA',to:'BBB',date:day(offset),departure:'20:00',train:'',travelClass:'SL',windowDays:60,originOffset:0,status,pnr:'',notes:'DesktopWindowFixture'}));
  try{
    assert.equal((await api('/api/railwatch/workspace','put',{...baseline,planner:{...baseline.planner,journeys:[...baseline.planner.journeys,...fixtures]}})).status(),200);
    await page.setViewportSize({width:1482,height:900});await page.goto(url+'/journeys');
    const workspace=page.getByRole('region',{name:'Desktop Journey Workspace',exact:true});
    await workspace.getByRole('textbox',{name:'Search Journeys',exact:true}).fill('DesktopWindowFixture');
    await expect(workspace.getByRole('article')).toHaveCount(6);
    for(const label of ['Record booking','View ticket','Confirm cancellation'])await expect(workspace.getByRole('button',{name:label,exact:true})).toHaveCount(0);
    const cancelled=workspace.getByRole('region',{name:'Cancelled column',exact:true});
    await expect(cancelled.getByRole('button',{name:'Expand Cancelled column',exact:true})).toBeVisible();
    await cancelled.getByRole('button',{name:'Expand Cancelled column',exact:true}).click();await cancelled.getByRole('button',{name:'Collapse Cancelled column',exact:true}).click();
    const trigger=workspace.getByRole('button',{name:'Select Travel Date Range',exact:true});assert.ok((await trigger.boundingBox()).width<225,'Date trigger stays compact');
    /** Applies a visible picker preset rather than modifying React state or the URL directly. */
    async function preset(name){await trigger.click();const picker=workspace.getByRole('dialog',{name:'Travel Date Range'});await picker.getByRole('button',{name,exact:true}).click();await picker.getByRole('button',{name:'Apply range',exact:true}).click();await expect(picker).toHaveCount(0);}
    await preset('Next 7 days');await expect(workspace.getByRole('article')).toHaveCount(2);await expect(workspace.getByRole('button',{name:'Active 2',exact:true})).toBeVisible();
    await workspace.getByRole('button',{name:'List',exact:true}).click();await expect(workspace.getByRole('table').locator('tbody tr')).toHaveCount(2);
    await preset('Next 30 days');await expect(workspace.getByRole('table').locator('tbody tr')).toHaveCount(3);
    await trigger.click();let picker=workspace.getByRole('dialog',{name:'Travel Date Range'});await picker.getByLabel('From date',{exact:true}).fill(day(40));await picker.getByLabel('To date',{exact:true}).fill(day(50));await picker.getByRole('button',{name:'Apply range',exact:true}).click();await expect(workspace.getByRole('table').locator('tbody tr')).toHaveCount(1);
    await trigger.click();picker=workspace.getByRole('dialog',{name:'Travel Date Range'});await picker.getByLabel('From date',{exact:true}).fill(day(50));await picker.getByLabel('To date',{exact:true}).fill(day(40));await picker.getByRole('button',{name:'Apply range',exact:true}).click();await expect(picker.getByRole('alert')).toContainText('End date');await page.keyboard.press('Escape');await expect(picker).toHaveCount(0);await expect(trigger).toBeFocused();
    await preset('All dates');await expect(workspace.getByRole('table').locator('tbody tr')).toHaveCount(6);
    await workspace.getByRole('button',{name:'Cancellation pending',exact:true}).click();await expect(workspace.getByRole('table').locator('tbody tr')).toHaveCount(1);
    await workspace.getByRole('button',{name:'All journeys',exact:true}).click();await workspace.getByRole('button',{name:'Board',exact:true}).click();await expect(workspace.getByRole('article')).toHaveCount(6);
    await workspace.getByRole('region',{name:'Booked column',exact:true}).getByRole('article').first().dragTo(cancelled);
    await expect(cancelled.getByRole('article')).toHaveCount(1);
    const moved=(await(await api('/api/railwatch/workspace')).json()).data;assert.equal(moved.planner.journeys.find(j=>j.id==='desktop-window-0').status,'cancelled');
    await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(cancelled.getByRole('article')).toHaveCount(0);await expect.poll(async()=>((await(await api('/api/railwatch/workspace')).json()).data.planner.journeys.find(j=>j.id==='desktop-window-0')?.status)).toBe('booked');
    await workspace.getByRole('button',{name:'List',exact:true}).click();await workspace.getByRole('button',{name:/Open journey/}).first().click();await expect(page.getByRole('dialog').getByLabel('Notes',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Close Dialog',exact:true}).click();
    for(const theme of ['light','dark']){
      const current=(await(await api('/api/railwatch/workspace')).json()).data;current.planner.settings.theme=theme;assert.equal((await api('/api/railwatch/workspace','put',current)).status(),200);await page.goto(url+'/journeys');
      await workspace.getByRole('button',{name:'List',exact:true}).click();await expect(workspace.getByRole('table')).toBeVisible();await expect(workspace.getByText('Loading journeys…',{exact:true})).toHaveCount(0);
      for(const width of [820,1040,1482]){await page.setViewportSize({width,height:900});assert.ok(await workspace.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Desktop workspace fits '+width);}
      await page.screenshot({path:`build/railwatch-qa/desktop-journeys-list-${theme}.png`,fullPage:false,animations:'disabled'});await workspace.getByRole('button',{name:'Board',exact:true}).click();await expect(workspace.getByText('Loading journeys…',{exact:true})).toHaveCount(0);await page.screenshot({path:`build/railwatch-qa/desktop-journeys-board-${theme}.png`,fullPage:false,animations:'disabled'});
    }
    console.log('Passed: desktop Board/List, compact date presets/custom validation, filtered counts, quick filters, collapsed cancellation drop target, details, and light/dark layouts.');
  }finally{
    const current=(await(await api('/api/railwatch/workspace')).json()).data;
    assert.equal((await api('/api/railwatch/workspace','put',{planner:baseline.planner,revision:current.revision})).status(),200);
    await page.setViewportSize({width:1482,height:876});await page.goto(url+'/journeys');
  }
}
