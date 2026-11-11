import assert from 'node:assert/strict';
import {expect} from './browser-expect.mjs';

/** Checks sparse and populated phone trip cards without retaining fixture changes. */
export async function verifyMobileHome({page,api,url,theme}){
  const read=async()=>(await(await api('/api/railwatch/workspace')).json()).data;
  const original=await read();
  const journey=original.planner.journeys.filter(item=>item.status==='booked'&&!item.archivedAt).sort((a,b)=>a.date.localeCompare(b.date))[0];
  assert.ok(journey,'Home fixture has an upcoming booked trip');
  const update=async fields=>{const current=await read();current.planner.journeys=current.planner.journeys.map(item=>item.id===journey.id?{...item,...fields}:item);assert.equal((await api('/api/railwatch/workspace','put',current)).status(),200);await page.goto(url+'/');};
  try{
    await update({train:'',trainNumber:'',trainName:'',coach:'',seat:'',berth:'',travelClass:'',departure:'04:22',departureConfirmed:false});
    const hero=page.getByRole('region',{name:'Next trip',exact:true});await expect(hero).toContainText('Confirmed');await expect(hero).not.toContainText('04:22');const compact=await hero.boundingBox();
    await page.screenshot({path:'build/railwatch-qa/home-compact-'+theme+'.png',animations:'disabled'});
    await update({trainNumber:'12632',trainName:'QA EXPRESS',coach:'QA1',seat:'42',departure:'04:22',departureConfirmed:true});await expect(hero).toContainText('04:22');await expect(hero).toContainText('QA1');await expect(hero).toContainText('42');assert.ok((await hero.boundingBox()).height>compact.height,'Recorded details receive space only when present');
    await page.screenshot({path:'build/railwatch-qa/home-details-'+theme+'.png',animations:'disabled'});
  }finally{const current=await read();current.planner=original.planner;assert.equal((await api('/api/railwatch/workspace','put',current)).status(),200);await page.goto(url+'/');}
}
