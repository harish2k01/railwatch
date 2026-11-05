import {expect} from './browser-expect.mjs';
import assert from 'node:assert/strict';

/** Exercises calendar status cues and empty-day creation against synthetic account data. */
export async function verifyCalendarExperience({page,api,url,today}){
  const original=(await(await api('/api/railwatch/workspace')).json()).data;
  const first=new Date(`${today.slice(0,7)}-01T00:00:00Z`);first.setUTCMonth(first.getUTCMonth()+1);
  const month=first.toISOString().slice(0,7),day=n=>`${month}-${String(n).padStart(2,'0')}`;
  const after=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  const trip=(id,from,date,status)=>({id,from,to:'END',date,status,departure:'20:00',train:'',pnr:'',travelClass:'',windowDays:60,originOffset:0,notes:''});
  try{
    const fixture={...original,planner:{...original.planner,rules:[],journeys:[trip('cal-planned','PLN',day(10),'needs_booking'),trip('cal-booked','BKG',day(11),'booked'),trip('cal-cancel','CXL',day(12),'cancellation_needed'),trip('cal-opens','OPN',after(day(15),60),'needs_booking')],holidays:[{id:'cal-time-off',name:'Calendar holiday',date:day(14),type:'company'}]}};
    assert.equal((await api('/api/railwatch/workspace','put',fixture)).status(),200);
    for(const theme of ['light','dark']){
      const current=(await(await api('/api/railwatch/workspace')).json()).data;current.planner.settings.theme=theme;assert.equal((await api('/api/railwatch/workspace','put',current)).status(),200);
      await page.setViewportSize({width:1440,height:1000});await page.goto(url+'/calendar');await page.getByRole('button',{name:'Next month',exact:true}).click();
      const planned=page.getByRole('button',{name:'PLN → END · Planned',exact:true}),booked=page.getByRole('button',{name:'BKG → END · Booked',exact:true}),cancel=page.getByRole('button',{name:'CXL → END · To cancel',exact:true});
      await expect(planned).toBeVisible();await expect(booked).toBeVisible();await expect(cancel).toBeVisible();
      const background=locator=>locator.evaluate(el=>getComputedStyle(el).backgroundColor);
      assert.equal(new Set(await Promise.all([planned,booked,cancel].map(background))).size,3,'Planned, booked and cancellation travel have distinct visual cues');
      assert.notEqual(await background(page.getByRole('button',{name:'Book: OPN → END',exact:true})),await background(page.getByRole('button',{name:'Calendar holiday',exact:true})),'Booking dates and time off use distinct colours');
      await expect(page.getByRole('group',{name:'Show on calendar',exact:true})).toBeVisible();
      await page.screenshot({path:`build/railwatch-qa/calendar-status-${theme}.png`,animations:'disabled'});
      const revision=(await(await api('/api/railwatch/workspace')).json()).data.revision;
      await page.getByRole('button',{name:`Plan journey on ${day(20)}`,exact:true}).click();
      const form=page.getByRole('dialog');await expect(form.getByRole('heading',{name:'New journey',exact:true})).toBeVisible();await expect(form.getByLabel('Travel date',{exact:true})).toHaveValue(day(20));await expect(form.getByRole('button',{name:'Plan travel',exact:true})).toHaveCount(0);await form.getByRole('button',{name:'Close dialog',exact:true}).click();
      await booked.click();await expect(page.getByRole('dialog').getByRole('list',{name:'Journey stages'})).toBeVisible();await expect(page.getByRole('dialog')).toContainText('BKG');await page.getByRole('dialog').getByRole('button',{name:'Close dialog',exact:true}).click();
      assert.equal((await(await api('/api/railwatch/workspace')).json()).data.revision,revision,'Calendar browsing must not save data');
      await page.setViewportSize({width:390,height:844});await page.goto(url+'/calendar');await page.getByLabel('Choose date',{exact:true}).fill(day(10));await expect(page.getByRole('region',{name:'Day agenda',exact:true}).getByText('Planned',{exact:true})).toBeVisible();
      await page.screenshot({path:`build/railwatch-qa/calendar-agenda-mobile-${theme}.png`,animations:'disabled'});
    }
  }finally{
    original.revision=(await(await api('/api/railwatch/workspace')).json()).data.revision;assert.equal((await api('/api/railwatch/workspace','put',original)).status(),200);await page.setViewportSize({width:1440,height:1000});
  }
  console.log('Passed: distinct calendar statuses/layers, direct dated creation, desktop editing and mobile agenda in both themes.');
}
