import assert from 'node:assert/strict';
import {expect} from './browser-expect.mjs';

/** Exercises the approved desktop workspace against owned server-side date and cursor filters. */
export async function verifyDesktopJourneys(page,api,url){
  const baseline=(await(await api('/api/railwatch/workspace')).json()).data;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const day=offset=>{const date=new Date(today+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);};
  const fixtures=[[2,'booked'],[4,'booked'],[45,'booked'],[60,'needs_booking'],[61,'needs_booking'],[7,'cancellation_needed']].map(([offset,status],i)=>({id:'desktop-window-'+i,from:'AAA',to:'BBB',date:day(offset),departure:'20:00',train:'',travelClass:'SL',windowDays:60,originOffset:0,status,pnr:'',notes:'DesktopWindowFixture'}));
  try{
    assert.equal((await api('/api/railwatch/workspace','put',{...baseline,planner:{...baseline.planner,journeys:[...baseline.planner.journeys,...fixtures]}})).status(),200);
    await page.setViewportSize({width:1482,height:900});await page.goto(url+'/journeys');
    const workspace=page.getByRole('region',{name:'Desktop journey workspace',exact:true});const rows=workspace.getByRole('button',{name:/^Open journey AAA to BBB/});
    for(const gone of ['Board','List','Timeline','Filters','Refresh journeys'])await expect(workspace.getByRole('button',{name:gone,exact:true})).toHaveCount(0);
    await workspace.getByRole('textbox',{name:'Search journeys',exact:true}).fill('DesktopWindowFixture');await expect(rows).toHaveCount(6);
    for(const label of ['Record booking','View ticket','Confirm cancellation'])await expect(workspace.getByRole('button',{name:label,exact:true})).toHaveCount(0);
    await rows.first().click();await page.getByRole('dialog').getByRole('button',{name:'More journey actions',exact:true}).click();await page.getByRole('dialog').getByRole('menuitem',{name:'Edit journey',exact:true}).click();await expect(page.getByRole('dialog').getByLabel('From',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Close dialog',exact:true}).click();
    for(const theme of ['light','dark']){
      const current=(await(await api('/api/railwatch/workspace')).json()).data;current.planner.settings.theme=theme;assert.equal((await api('/api/railwatch/workspace','put',current)).status(),200);await page.goto(url+'/journeys');await expect(workspace.getByText('Loading journeys…',{exact:true})).toHaveCount(0);
      for(const width of [820,1040,1482]){await page.setViewportSize({width,height:900});assert.ok(await workspace.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Desktop workspace fits '+width);}
      await page.screenshot({path:`build/railwatch-qa/desktop-journeys-${theme}.png`,fullPage:false,animations:'disabled'});
    }
    console.log('Passed: desktop Journeys grouped list, search, board chips (To cancel, No ticket, All), details, and light/dark layouts.');
  }finally{
    const current=(await(await api('/api/railwatch/workspace')).json()).data;
    assert.equal((await api('/api/railwatch/workspace','put',{planner:baseline.planner,revision:current.revision})).status(),200);
    await page.setViewportSize({width:1482,height:876});await page.goto(url+'/journeys');
  }
}
