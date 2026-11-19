// Compact caption access. Subtitle generation and writes remain owned by Studio.
import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { filmCaptions, readSubtitleStyle } from 'openfilm/studio-captions';
import { parseFilmSubtitleStyle } from 'openfilm/film-subtitle';
import { readProjectFilm } from 'openfilm/studio-film';
import { running } from 'openfilm/studio-client';

const keys=new Set(['on','pos','maxWidthPct','align','font','fill','stroke','shadow','box','karaoke','language','bilingual','fadeMs']);
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const bounded=(v,max)=>Buffer.byteLength(JSON.stringify(v))<=max;
const int=v=>Number.isInteger(v)&&v>=0;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,16);

export function captionPage(data,params={},revision=''){
 const offset=params.offset??0,limit=params.limit??20;
 if(!int(offset)||!Number.isInteger(limit)||limit<1||limit>50)throw Error('Invalid caption pagination');
 const start=params.start??0,end=params.end??Number.MAX_SAFE_INTEGER;
 if(!finite(start)||!finite(end)||start<0||end<=start)throw Error('Invalid caption time window');
 const cues=data.cues.filter(c=>c.startMs+c.durMs>start*1000&&c.startMs<end*1000);
 const chosen=cues.slice(offset,offset+limit).map(c=>({
  start_ms:c.startMs,duration_ms:c.durMs,text:c.text.slice(0,400),
  ...(c.clip?{clip:c.clip}:{}),...(c.src?{src:c.src}:{}),
  ...(c.line!==undefined?{line:c.line}:{}),...(c.part!==undefined?{part:c.part}:{}),
  ...(c.speaker?{speaker:c.speaker}:{}),
  ...(c.alt?{translations:Object.keys(c.alt).slice(0,8)}:{})
 }));
 return {revision,total:cues.length,offset,returned:chosen.length,
  next_offset:offset+limit<cues.length?offset+limit:null,
  source_language:data.sourceLanguage,languages:data.languages.slice(0,12),
  untranscribed:data.untranscribed.slice(0,20),cues:chosen};
}
export function captionCorrection(params){
 if(!object(params)||typeof params.revision!=='string'||!/^[a-f0-9]{16}$/.test(params.revision)
  ||typeof params.src!=='string'||!params.src.trim()||params.src.length>500
  ||!int(params.line)||params.part!==undefined&&!int(params.part)
  ||typeof params.text!=='string'||params.text.length<1||params.text.length>1200
  ||typeof params.expected_text!=='string'||params.expected_text.length>1200
  ||params.language!==undefined&&(typeof params.language!=='string'||params.language.length>16))
  throw Error('Invalid caption correction');
 return params;
}
export function patchSubtitleStyle(current,changes){
 if(!object(changes)||!Object.keys(changes).length||Object.keys(changes).some(k=>!keys.has(k))
   ||!bounded(changes,5000))throw Error('Invalid subtitle style patch');
 const base=current??parseFilmSubtitleStyle(null);
 const merged={...base,...changes};
 for(const key of ['font','pos','stroke','shadow','box','karaoke']){
  if(object(changes[key])&&object(base[key]))merged[key]={...base[key],...changes[key]};
 }
 return parseFilmSubtitleStyle(merged);
}
async function studioProject(project){
 const studio=await running();
 if(!studio)throw Error('Studio must be running to edit subtitles');
 const headers={'x-studio-key':studio.key};
 const list=await fetch(studio.origin+'/api/projects',{headers,signal:AbortSignal.timeout(12000)});
 if(!list.ok)throw Error('Cannot verify open Studio projects: HTTP '+list.status);
 const items=(await list.json()).projects??[];
 const canonical=await realpath(project);
 let match=null;
 for(const item of items){
  if(typeof item.id!=='string'||typeof item.path!=='string'||item.missing)continue;
  const path=await realpath(item.path).catch(()=>null);
  if(path===canonical){match=item;break}
 }
 if(!match)throw Error('This project is not open in Studio');
 return {url:studio.origin+'/api/projects/'+encodeURIComponent(match.id),key:studio.key};
}
/** Authenticated request scoped to this exact project, without exposing the key to the agent. */
export async function studioRequest(project,resource,method='GET',body=null,timeout=15000){
 const {url,key}=await studioProject(project);
 if(typeof resource!=='string'||!/^[a-z][a-z0-9/_-]*$/.test(resource)||resource.includes('..'))throw Error('Invalid Studio resource path');
 const res=await fetch(url+'/'+resource,{
  method,headers:{'x-studio-key':key,...(body===null?{}:{'content-type':'application/json'})},
  ...(body===null?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(timeout)
 });
 const result=await res.json().catch(()=>({}));
 if(!res.ok)throw Error('Studio rejected '+resource+' ('+res.status+'): '+String(result.error??result.message??'invalid request').slice(0,350));
 return result;
}
async function studioWrite(project,resource,method,body){
 return studioRequest(project,resource,method,body);
}
async function currentFilm(project,rev){
 const film=await readProjectFilm(project);
 if(!film.value)throw Error('Invalid film.html');
 if(film.rev!==rev)throw Error('Film revision changed; inspect captions again');
 return film.rev;
}
export async function captionTool(project,name,params={}){
 if(name==='captions_list'){
  const film=await readProjectFilm(project);
  if(!film.value)throw Error('Invalid film.html');
  const cues=await filmCaptions(project);
  return captionPage(cues,params,film.rev);
 }
 if(name==='captions_style'){
  if(!object(params)||!['get','patch'].includes(params.action))throw Error('Choose get or patch');
  const current=await readSubtitleStyle(project);
  const normalized=current??parseFilmSubtitleStyle(null);
  const styleRevision=digest(normalized);
  if(params.action==='get')return {style:normalized,style_revision:styleRevision};
  if(typeof params.style_revision!=='string'||params.style_revision!==styleRevision)throw Error('Subtitle style changed; reload style');
  const style=patchSubtitleStyle(normalized,params.changes);
  const result=await studioWrite(project,'subtitles','PUT',{style});
  const saved=result.style??style;
  return {status:'updated',style_revision:digest(saved),style:saved};
 }
 if(name==='captions_correct_line'){
  const args=captionCorrection(params);
  await currentFilm(project,args.revision);
  const {cues}=await filmCaptions(project);
  const matches=cues.filter(c=>c.src===args.src&&c.line===args.line&&(c.part??null)===(args.part??null));
  if(!matches.length)throw Error('Caption line not present in current film');
  const expected=matches.some(c=>(args.language?c.alt?.[args.language]:c.text)===args.expected_text);
  if(!expected)throw Error('Caption text changed; inspect current cues before editing');
  await studioWrite(project,'captions/line','PUT',{
   src:args.src,line:args.line,...(args.part!==undefined?{part:args.part}:{}),
   text:args.text,...(args.language?{language:args.language}:{})
  });
  return {status:'updated',src:args.src,line:args.line,part:args.part??null};
 }
 throw Error('Unknown caption operation');
}
