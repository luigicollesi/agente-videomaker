/** Deterministic, read-only film integrity checks. No browser, subprocess or media decoding. */
import { stat, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { clipSpan, kindOf } from 'openfilm/film-doc';

const round=n=>Math.round(n*1000)/1000;
const internal=(base,file)=>{
 const rel=relative(base,file);
 return rel!==''&&rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel);
};

export async function auditFilm(project,film,revision,expectedSeconds){
 if(expectedSeconds!==undefined&&!(typeof expectedSeconds==='number'&&Number.isFinite(expectedSeconds)&&expectedSeconds>=0&&expectedSeconds<=86400))
  throw Error('Invalid expected film duration');
 const root=await realpath(project);
 const problems=[],warnings=[],unknown=[];
 let maximum=0,clips=0;
 for(const [track,group] of (film.tracks??[]).entries()){
  for(const clip of (group.clips??[])){
   clips++;
   const label=String(clip.id??clip.src??'unnamed').slice(0,110);
   const source=String(clip.src??'');
   const kind=kindOf(clip);
   const at=clip.at??0;
   let length=null;
   if(Array.isArray(clip.time)&&clip.time.length===2){
    try{length=clipSpan(clip,undefined).length}catch(e){problems.push({track,clip:label,issue:String(e.message).slice(0,220)})}
   }else if(kind==='still'){
    problems.push({track,clip:label,issue:'Still image requires explicit duration'});
   }else{
    unknown.push({track,clip:label,reason:'Source duration not declared in film.html'});
   }
   if(length!==null){
    if(!Number.isFinite(length)||length<=0)problems.push({track,clip:label,issue:'Invalid clip duration'});
    else maximum=Math.max(maximum,at+length);
   }
   const cleanSource=source.split('#')[0].split('?')[0];
   if(!cleanSource||/^[a-z][a-z\d+.-]*:/i.test(cleanSource)){
    warnings.push({track,clip:label,issue:'External or missing source cannot be checked locally'});
    continue;
   }
   const file=resolve(root,cleanSource);
   if(!internal(root,file)){problems.push({track,clip:label,issue:'Source escapes project'});continue}
   try{
    const canonical=await realpath(file);
    if(!internal(root,canonical)||!(await stat(canonical)).isFile())problems.push({track,clip:label,issue:'Source is not a regular project file'});
   }catch{problems.push({track,clip:label,issue:'Source file does not exist'})}
  }
 }
 const known=unknown.length===0&&problems.every(p=>p.issue!=='Invalid clip duration'&&p.issue!=='Still image requires explicit duration');
 const exact=known?round(maximum):null;
 return {
  revision,stage:film.stage,track_count:film.tracks?.length??0,clip_count:clips,
  duration_seconds:exact,minimum_known_end_seconds:round(maximum),
  duration_confirmed:known&&problems.length===0,
  ...(expectedSeconds===undefined?{}:{expected_seconds:expectedSeconds,expected_duration_matches:exact===null?null:Math.abs(exact-expectedSeconds)<=0.01}),
  unknown_durations:unknown.slice(0,30),
  problems:problems.slice(0,50),warnings:warnings.slice(0,20),
  notes:exact===null?'Duration not asserted: inspect native media and pages with no explicit time range':'Calculated from explicit clip source time ranges and playback speeds'
 };
}
