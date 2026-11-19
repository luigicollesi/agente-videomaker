/** Native Studio caption generation, translation and compact track inspection. */
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { filmCaptions } from 'openfilm/studio-captions';
import { readVtt, cuePlain } from 'openfilm/captions-vtt';
import { readProjectFilm } from 'openfilm/studio-film';
import { studioRequest } from './captions.mjs';

const revision=v=>typeof v==='string'&&/^[a-f0-9]{16}$/.test(v);
const source=v=>typeof v==='string'&&/^captions\/[A-Za-z0-9 _.-]{1,120}\.vtt$/.test(v)&&!v.includes('..');
const language=v=>typeof v==='string'&&/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(v);
const boundedName=v=>v===undefined||typeof v==='string'&&v.trim().length>0&&v.length<=60;
const approved=v=>v===true;
async function current(project,expected){
 const film=await readProjectFilm(project);
 if(!film.value)throw Error('Invalid project film');
 if(!revision(expected)||film.rev!==expected)throw Error('Stale film revision; inspect again');
 return film;
}
export function captionActionArgs(name,args){
 if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Missing caption parameters');
 if(name==='captions_transcribe'){
  if(!approved(args.external_approved)||!Array.isArray(args.srcs)||args.srcs.length<1||args.srcs.length>3||!args.srcs.every(v=>typeof v==='string'&&v.length<=250))throw Error('Transcription requires explicit external approval and 1–3 source paths');
 }else if(name==='captions_translate'){
  if(!approved(args.external_approved)||!language(args.language))throw Error('Translation requires explicit external approval and valid language');
 }else if(name==='caption_tracks'){
  if(!['from_subtitles','sync','new','translate'].includes(args.action))throw Error('Unknown caption track action');
  if(args.action==='new'){
   if(!boundedName(args.name)||typeof args.text!=='string'||args.text.length>40000)throw Error('Invalid WebVTT/SRT data');
  }else if(args.action==='translate'){
   if(!source(args.src)||!language(args.language)||!approved(args.external_approved)||!boundedName(args.name))throw Error('Caption track translation requires approval and source');
  }else if(args.action==='from_subtitles'){
   if(!boundedName(args.name)||args.clips!==undefined&&(!Array.isArray(args.clips)||args.clips.length>30||!args.clips.every(v=>typeof v==='string'&&v.length<=100)))throw Error('Invalid caption source clips');
  }else if(!boundedName(args.name)||!boundedName(args.label))throw Error('Invalid synchronization options');
 }else if(name==='caption_track_cues'){
  if(!source(args.src)||args.limit!==undefined&&(!Number.isInteger(args.limit)||args.limit<1||args.limit>50)||args.offset!==undefined&&(!Number.isInteger(args.offset)||args.offset<0))throw Error('Invalid caption track query');
 }else throw Error('Unknown caption operation');
 return args;
}
export async function captionActions(project,name,raw){
 const args=captionActionArgs(name,raw);
 if(name==='caption_track_cues'){
  const base=await realpath(project),path=await realpath(resolve(project,args.src));
  const rel=relative(base,path);
  if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)||!(await stat(path)).isFile())throw Error('Caption track path leaves the project');
  const info=await stat(path);
  if(info.size>2*1024*1024)throw Error('Caption file is too large');
  const vtt=readVtt(await readFile(path,'utf8'));
  const limit=args.limit??20,offset=args.offset??0;
  return {source:args.src,total:vtt.cues.length,offset,returned:Math.min(limit,Math.max(0,vtt.cues.length-offset)),next_offset:offset+limit<vtt.cues.length?offset+limit:null,
   cues:vtt.cues.slice(offset,offset+limit).map(c=>({id:c.id,start:c.start,end:c.end,text:cuePlain(c.text).slice(0,450)}))};
 }
 if(name==='captions_transcribe'){
  const {untranscribed}=await filmCaptions(project);
  const targets=[...new Set(args.srcs)];
  if(targets.some(src=>!untranscribed.includes(src)))throw Error('A requested source is not pending transcription');
  const reply=await studioRequest(project,'subtitles/transcribe','POST',{srcs:targets},180000);
  return {status:'processed',transcribed:(reply.transcribed??[]).slice(0,3),failed:(reply.failed??[]).slice(0,3)};
 }
 if(name==='captions_translate'){
  const reply=await studioRequest(project,'subtitles/translate','POST',{language:args.language},180000);
  return {status:'processed',language:args.language,translated:(reply.translated??[]).slice(0,15),failed:(reply.failed??[]).slice(0,15),already:reply.already??false};
 }
 if(name==='caption_tracks'){
  if(args.action==='sync'){
   await current(project,args.revision);
   const result=await studioRequest(project,'caption-tracks/sync','POST',{name:args.name,label:args.label},30000);
   return {status:'synced',made:result.made??null,updated:result.updated??null};
  }
  if(args.action==='from_subtitles'){
   const result=await studioRequest(project,'caption-tracks/from-subtitles','POST',{name:args.name,clips:args.clips},30000);
   return {status:'created',source:result.src};
  }
  if(args.action==='new'){
   const result=await studioRequest(project,'caption-tracks/new','POST',{name:args.name,text:args.text},30000);
   return {status:'created',source:result.src};
  }
  const result=await studioRequest(project,'caption-tracks/translate','POST',{src:args.src,language:args.language,name:args.name},180000);
  return {status:'translated',source:result.src,language:args.language};
 }
 throw Error('Unknown caption action');
}
