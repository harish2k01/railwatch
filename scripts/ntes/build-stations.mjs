// Derive the bundled directory exclusively from a completed NTES crawl.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const raw=process.argv[2]??'scripts/data/raw';
const status=JSON.parse(await readFile(path.join(raw,'crawl-status.json'),'utf8'));
if(status.phase!=='DONE')throw Error('Crawl incomplete; preserving the existing directory.');
const local=new Set(['SUB','EMU','MEMU','DEMU','DMU','MMTS','TOY','VNDM','PEXP','PAS']);
const eligible=new Set(['RAJ','SHT','JSH','DRNT','GBR','TEJ','GT','VNDB','VNDS','SUF','AMTB','SKR','HUM','ANT','SUV','YPR','MEX','EXP','TOD','TRST','SPL']);
const next=new Map(),unknown=new Set();let trains=0,stops=0;
const upper=new Set(['JN','CANT','RS','HLT','PH','MG','SG','GT','KSR']);
const title=name=>name.trim().replace(/\.$/,'').replace(/\s+/g,' ').toLowerCase().split(' ').map(w=>upper.has(w.toUpperCase())?w.toUpperCase():w.replace(/(^|[-(.])([a-z])/g,(_,p,c)=>p+c.toUpperCase())).join(' ');
for(const file of (await readdir(path.join(raw,'schedules'))).filter(f=>f.endsWith('.json')).sort()){
 const s=JSON.parse(await readFile(path.join(raw,'schedules',file),'utf8'));if(!s.stations?.length)continue;
 trains++;const type=(s.TrainType??'').trim().toUpperCase();
 if(local.has(type))continue;if(!eligible.has(type)){unknown.add(type||'(missing)');continue;}
 for(const stop of s.stations){
  const code=(stop.StationCode??'').trim().toUpperCase(),name=(stop.StationName??'').trim();
  if(!/^[A-Z]{1,5}$/.test(code)||!name)continue;
  // Do not include intermediate pass-through entries with no halt.
  if(stop.STA===stop.STD&&Number(stop.Halt??0)===0)continue;
  stops++;if(!next.has(code))next.set(code,title(name));
 }
}
if(unknown.size)throw Error(`Review unknown NTES train categories before publishing: ${[...unknown].join(', ')}`);
const previous=new Map(JSON.parse(await readFile('src/data/stations.json','utf8')));
if(trains<5000||stops<45000||next.size<6500||next.size<previous.size*.9)throw Error(`Incomplete or unusually reduced directory: ${trains} trains, ${stops} stops, ${next.size} stations. Existing file preserved.`);
const rows=[...next].sort(([a],[b])=>a.localeCompare(b));
const added=rows.filter(([c])=>!previous.has(c)),dropped=[...previous].filter(([c])=>!next.has(c)),renamed=rows.filter(([c,n])=>previous.has(c)&&previous.get(c)!==n);
const report=`NTES: ${trains} schedules, ${stops} eligible stops, ${rows.length} stations.\n\n`+[['Added',added],['Dropped',dropped],['Names changed',renamed]].map(([label,items])=>`**${label} (${items.length}):** ${items.map(([c,n])=>`${c}: ${n}`).join(', ')||'none'}`).join('\n\n');
if(process.env.STATIONS_SUMMARY)await writeFile(process.env.STATIONS_SUMMARY,report+'\n');
await writeFile('src/data/stations.json',JSON.stringify(rows)+'\n');console.log(report);
