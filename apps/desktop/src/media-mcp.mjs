/** Local Media MCP server with read-only inspection and controlled video reversal. */
import { createInterface } from 'node:readline';
import { readFile, mkdtemp, rm, realpath, stat, lstat, link, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname, relative, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { unlinkSync } from 'node:fs';
import { readProjectFilm, changeProjectFilm } from '../../../packages/openfilm/studio/server/film.mjs';
import { kindOf, readFilm } from '../../../packages/openfilm/src/film-doc.mjs';
import { applyOps } from '../../../packages/openfilm/studio/server/ops.mjs';

const project=resolve(process.env.VIDEOMAKER_PROJECT || process.cwd());
const require=createRequire(import.meta.url);
const images=new Set(['.jpg','.jpeg','.png','.webp']);
const videos=new Set(['.mp4','.mov','.webm','.mkv','.avi','.m4v']);
const pythonBinary=()=>process.env.VIDEOMAKER_PYTHON || (process.platform==='win32'?'python':'python3');
const schema={type:'object',properties:{path:{type:'string',description:'Media path inside project/assets'}} ,required:['path']};
const tools=[
 {name:'inspect_image',description:'Inspect an image from this project Media. Returns visual image content, not a filename description.',inputSchema:schema},
 {name:'inspect_video',description:'Inspect a video from this project Media. Returns timestamped image frames. Sampled frames do not guarantee exact event boundaries.',inputSchema:{type:'object',properties:{...schema.properties,start:{type:'number',minimum:0},end:{type:'number',minimum:0},max_frames:{type:'integer',minimum:1,maximum:24}},required:['path']}},
 {name:'timeline_overview',description:'Read-only overview of the current project film, its revision, stage and number of tracks/clips.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'timeline_split_clip',description:'Split one clip using explicit source-time intervals and timeline second, as required by Studio. Current revision required. Source timings must be provided accurately.',inputSchema:{type:'object',properties:{clip:{type:'string'},revision:{type:'string'},at:{type:'number',exclusiveMinimum:0},left_time:{type:'array',items:{type:'number'},minItems:2,maxItems:2},right_time:{type:'array',items:{type:'number'},minItems:2,maxItems:2}},required:['clip','revision','at','left_time','right_time'],additionalProperties:false}},
 {name:'timeline_set_playback',description:'Set clip playback speed (0.1..100) or volume (0..4) using Studio. Requires current revision.',inputSchema:{type:'object',properties:{clip:{type:'string'},revision:{type:'string'},field:{type:'string',enum:['speed','volume']},value:{type:'number'}},required:['clip','revision','field','value'],additionalProperties:false}},
 {name:'timeline_duplicate_clip',description:'Duplicate an existing clip at a nonnegative timeline second using Studio, requiring an exact current revision.',inputSchema:{type:'object',properties:{clip:{type:'string'},at:{type:'number',minimum:0},revision:{type:'string'}},required:['clip','at','revision'],additionalProperties:false}},
 {name:'timeline_move_clip',description:'Move one clip to a nonnegative timeline second using the Studio edit engine. Requires current revision returned by timeline_overview; stale revisions are refused.',inputSchema:{type:'object',properties:{clip:{type:'string'},at:{type:'number',minimum:0},revision:{type:'string'}},required:['clip','at','revision'],additionalProperties:false}},
 {name:'timeline_clips',description:'Read-only bounded list of clips from the current film, with IDs, source, kind and timeline/source timing.',inputSchema:{type:'object',properties:{track:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100},offset:{type:'integer',minimum:0}},additionalProperties:false}},
 {name:'music_analyze',description:'Analyze an existing WAV, MP3 or MP4 in project/assets and save a new acoustic-analysis JSON in assets. Offline; may require Python analysis dependencies.',inputSchema:{type:'object',properties:{path:schema.properties.path,output:{type:'string',description:'New analysis JSON path inside project/assets'}},required:['path','output']}},
 {name:'music_overview',description:'Get compact BPM, dynamics and structure overview from an existing analysis JSON.',inputSchema:schema},
 {name:'music_context',description:'Get acoustic context of a time interval from an existing analysis JSON.',inputSchema:{type:'object',properties:{...schema.properties,start:{type:'number',minimum:0},end:{type:'number',exclusiveMinimum:0}},required:['path','start','end']}},
 {name:'music_cues',description:'Get bounded editing cues for an interval from an analysis JSON.',inputSchema:{type:'object',properties:{...schema.properties,start:{type:'number',minimum:0},end:{type:'number',exclusiveMinimum:0},limit:{type:'integer',minimum:1,maximum:100}},required:['path','start','end']}},
 {name:'reverse_video',description:'Reverse an existing video into a NEW MP4 in project/assets. Does not overwrite files. Uses the existing video reverse implementation; audio can be muted, reversed or kept.',inputSchema:{type:'object',properties:{path:schema.properties.path,output:{type:'string',description:'New .mp4 path inside project/assets'},start:{type:'number',minimum:0},end:{type:'number',exclusiveMinimum:0},audio:{type:'string',enum:['mute','reverse','keep']}},required:['path','output']}}
];
async function safePath(raw,extensions){
 if(typeof raw!=='string'||!raw.trim())throw Error('Missing Media path');
 const base=await realpath(join(project,'assets'));
 const file=await realpath(isAbsolute(raw)?raw:resolve(project,raw));
 const rel=relative(base,file);
 if(rel.startsWith('..')||isAbsolute(rel)||!rel||!extensions.has(extname(file).toLowerCase()))throw Error('Path must be an allowed file in project/assets');
 if(!(await stat(file)).isFile())throw Error('Not a file');
 return file;
}
const MAX_OUTPUT_BYTES=4*1024*1024;
const activeChildren=new Set();
const HEAVY_LOCK=join(project,'.videomaker-mcp-heavy.lock');
let activeHeavyJob=false;
let ownsHeavyLock=false;
async function heavyJob(work){
 if(activeHeavyJob)throw Error('A media processing job is already running');
 activeHeavyJob=true;
 let lock;
 try{
  try{lock=await open(HEAVY_LOCK,'wx',0o600)}
  catch(error){
   if(error?.code==='EEXIST')throw Error('Another MCP instance is processing media in this project; if it crashed, verify the process is gone before deleting .videomaker-mcp-heavy.lock');
   throw error;
  }
  ownsHeavyLock=true;
  await lock.writeFile(JSON.stringify({pid:process.pid,started:new Date().toISOString()})+'\n');
  return await work();
 }finally{
  if(lock){
   await lock.close().catch(()=>{});
   try{await rm(HEAVY_LOCK)}catch(error){if(error?.code!=='ENOENT')process.stderr.write('MCP lock cleanup failed: '+String(error)+'\n')}
   ownsHeavyLock=false;
  }
  activeHeavyJob=false;
 }
}
function terminateChild(child){
 if(process.platform==='win32' && child.pid){
  try{const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});killer.on('error',()=>{});killer.unref()}catch{/* process already ended */}
  return;
 }
 if(child.pid){try{process.kill(-child.pid,'SIGKILL');return}catch{/* group already ended */}}
 try{child.kill('SIGKILL')}catch{/* child already ended */}
}
function exec(name,args,timeout=30000,env=process.env){
 return new Promise((resolve,reject)=>{
  const child=spawn(name,args,{stdio:['ignore','pipe','pipe'],env,detached:process.platform!=='win32'});
  activeChildren.add(child);
  const out=[],err=[];
  let bytes=0,failure=null;
  const stop=reason=>{
   if(failure)return;
   failure=reason;
   terminateChild(child);
  };
  const timer=setTimeout(()=>stop(Error(name+' timed out')),timeout);
  const consume=(parts,chunk)=>{
   if(failure)return;
   bytes+=chunk.length;
   if(bytes>MAX_OUTPUT_BYTES){stop(Error(name+' output exceeded limit'));return}
   parts.push(chunk);
  };
  child.stdout.on('data',d=>consume(out,d));
  child.stderr.on('data',d=>consume(err,d));
  child.on('error',e=>{failure??=e});
  child.on('close',code=>{
   clearTimeout(timer);
   activeChildren.delete(child);
   if(failure)return reject(failure);
   if(code!==0)return reject(Error(Buffer.concat(err).toString().slice(0,600)||name+' failed'));
   resolve(Buffer.concat(out));
  });
 });
}
process.on('exit',()=>{
 for(const child of activeChildren)terminateChild(child);
 if(ownsHeavyLock){try{unlinkSync(HEAVY_LOCK)}catch{/* already removed */}}
});
process.once('SIGTERM',()=>process.exit(143));
process.once('SIGINT',()=>process.exit(130));

const image=(data,mime)=>({type:'image',mimeType:mime,data:data.toString('base64')});
async function inspect(name,args){
 const path=await safePath(args?.path,name==='inspect_image'?images:videos);
 if(name==='inspect_image'){
  const data=await readFile(path);
  if(data.length>15_000_000)throw Error('Image exceeds 15 MB');
  return {content:[image(data,extname(path).toLowerCase()==='.png'?'image/png':extname(path).toLowerCase()==='.webp'?'image/webp':'image/jpeg')]};
 }
 if(name!=='inspect_video')throw Error('Unknown tool');
 const probe=JSON.parse((await exec('ffprobe',['-v','error','-show_entries','format=duration','-of','json',path])).toString());
 const duration=Number(probe.format?.duration);
 const start=args?.start??0,end=args?.end??duration,n=args?.max_frames??12;
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>duration+.01||end<=start||!Number.isInteger(n)||n<1||n>24)throw Error('Invalid interval or frame count');
 const folder=await mkdtemp(join(tmpdir(),'videomaker-media-mcp-'));
 try{
  const content=[];
  for(let i=0;i<n;i++){
   const time=start+(Math.min(end,duration)-start)*(i+.5)/n;
   const dest=join(folder,`frame-${i}.jpg`);
   await exec('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-ss',time.toFixed(5),'-i',path,'-frames:v','1','-vf','scale=960:-2:force_original_aspect_ratio=decrease','-q:v','4',dest],15000);
   content.push({type:'text',text:`Frame ${i+1}/${n} at ${time.toFixed(3)} seconds`});
   content.push(image(await readFile(dest),'image/jpeg'));
  }
  return {content};
 }finally{await rm(folder,{recursive:true,force:true})}
}

async function safeOutput(raw,extension='.mp4'){
 if(typeof raw!=='string'||!raw.trim())throw Error('Missing output path');
 const base=await realpath(join(project,'assets'));
 const dest=resolve(project,raw);
 if(extname(dest).toLowerCase()!==extension)throw Error('Output must be '+extension);
 const parent=await realpath(dirname(dest));
 const rel=relative(base,dest);
 if(rel.startsWith('..')||isAbsolute(rel)||!rel||parent!==base&&(!relative(base,parent)||relative(base,parent).startsWith('..')||isAbsolute(relative(base,parent))))throw Error('Output must be inside project/assets');
 try{await lstat(dest);throw Error('Output already exists')}catch(e){if(e?.code!=='ENOENT')throw e}
 return dest;
}
async function reverseVideo(args){
 const input=await safePath(args?.path,videos);
 const output=await safeOutput(args?.output);
 if(input===output)throw Error('Input and output must differ');
 if(args?.start!==undefined&&(!Number.isFinite(args.start)||args.start<0))throw Error('Invalid start');
 if(args?.end!==undefined&&(!Number.isFinite(args.end)||args.end<=0||args.end<=(args.start??0)))throw Error('Invalid end');
 const audio=args?.audio??'mute';
 if(!['mute','reverse','keep'].includes(audio))throw Error('Invalid audio mode');
 const modulePath=require.resolve('openfilm/skills');
 const script=resolve(dirname(modulePath),'../manual/media/scripts/reverse-video.py');
 const cli=[script,input,output,'--audio',audio];
 if(args?.start!==undefined)cli.push('--start',String(args.start));
 if(args?.end!==undefined)cli.push('--end',String(args.end));
 await heavyJob(()=>exec(pythonBinary(),cli,600000));
 return {content:[{type:'text',text:JSON.stringify({status:'created',path:relative(project,output),audio})}]};
}


const musicSources=new Set(['.wav','.mp3','.mp4']);
const analysisFiles=new Set(['.json']);
function musicRuntime(){
 const src=resolve(dirname(require.resolve('openfilm/skills')),'../../music-analyzer/src');
 const existing=process.env.PYTHONPATH;
 return { ...process.env, PYTHONPATH:existing?[src,existing].join(process.platform==='win32'?';':':'):src };
}
function intervalArgs(args){
 if(!Number.isFinite(args?.start)||!Number.isFinite(args?.end)||args.start<0||args.end<=args.start)throw Error('Invalid interval');
 return ['--start',String(args.start),'--end',String(args.end)];
}
async function musicTool(name,args){
 let cli;
 if(name==='music_analyze'){
  const input=await safePath(args?.path,musicSources);
  const output=await safeOutput(args?.output,'.json');
  cli=['analyze',input,'--output',output];
 } else {
  const file=await safePath(args?.path,analysisFiles);
  cli=[name==='music_overview'?'overview':name==='music_context'?'context':'cues',file];
  if(name==='music_context'||name==='music_cues')cli.push(...intervalArgs(args));
  if(name==='music_cues'){
   const limit=args?.limit??30;
   if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid cue limit');
   cli.push('--limit',String(limit));
  }
 }
 const python=pythonBinary();
 if(name==='music_analyze'){
  const destination=cli[3];
  return heavyJob(async()=>{
   const folder=await mkdtemp(join(dirname(destination),'.music-mcp-'));
   try{
    cli[3]=join(folder,'analysis.json');
    const data=await exec(python,['-m','music_analyzer.cli',...cli],600000,musicRuntime());
    let output;
    try{output=JSON.parse(data.toString('utf8'))}catch{throw Error('Music analyzer returned invalid JSON')}
    const validation=await exec(python,['-m','music_analyzer.cli','validate',cli[3]],60000,musicRuntime());
    let checked;
    try{checked=JSON.parse(validation.toString('utf8'))}catch{throw Error('Music analyzer validation returned invalid JSON')}
    if(!checked.valid)throw Error('Music analysis failed validation');
    await link(cli[3],destination);
    return {content:[{type:'text',text:JSON.stringify({...output,output_path:relative(project,destination)})}]};
   }finally{await rm(folder,{recursive:true,force:true})}
  });
 }
 const data=await exec(python,['-m','music_analyzer.cli',...cli],60000,musicRuntime());
 let output;
 try{output=JSON.parse(data.toString('utf8'))}catch{throw Error('Music analyzer returned invalid JSON')}
 return {content:[{type:'text',text:JSON.stringify(output)}]};
}


async function timelineEdit(name,args){
 if(name==='timeline_split_clip'){
  const validRange=t=>Array.isArray(t)&&t.length===2&&t.every(v=>Number.isFinite(v)&&v>=0)&&t[1]>t[0];
  if(typeof args?.clip!=='string'||!args.clip.trim()||typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision)||!Number.isFinite(args.at)||args.at<=0||!validRange(args.left_time)||!validRange(args.right_time)||Math.abs(args.left_time[1]-args.right_time[0])>0.002)throw Error('Invalid split parameters or discontinuous source intervals');
  return guardedTimelineOps(args.revision,[{op:'split',clip:args.clip,at:args.at,time:args.left_time,restTime:args.right_time}],{clip:args.clip,at:args.at,operation:name});
 }
 if(name==='timeline_set_playback'){
  if(typeof args?.clip!=='string'||!args.clip.trim()||typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision)||!['speed','volume'].includes(args.field)||!Number.isFinite(args.value)||args.value<(args.field==='speed'?0.1:0)||args.value>(args.field==='speed'?100:4))throw Error('Invalid playback property');
  return guardedTimelineOps(args.revision,[{op:'set',clip:args.clip,field:args.field,value:args.value}],{clip:args.clip,field:args.field,value:args.value});
 }
 if(typeof args?.clip!=='string'||!args.clip.trim()||typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision)||!Number.isFinite(args.at)||args.at<0)throw Error('Invalid timeline move arguments');
 const current=await readProjectFilm(project);
 if(!current.value)throw Error('Invalid film.html');
 if(current.rev!==args.revision)throw Error('Stale timeline revision; inspect again');
 const exists=current.value.tracks.some(t=>t.clips?.some(c=>c.id===args.clip));
 if(!exists)throw Error('Clip not found');
 const ops=[name==='timeline_duplicate_clip'?{op:'insert',from:args.clip,at:args.at}:{op:'move',clip:args.clip,at:args.at}];
 return guardedTimelineOps(args.revision,ops,{clip:args.clip,at:args.at,operation:name});
}
async function guardedTimelineOps(revision,ops,summary){
 const result=await changeProjectFilm(project,(value,latest)=>{
  if(latest.rev!==revision)throw Error('Stale timeline revision; inspect again');
  if(!latest.value)throw Error('Invalid film.html');
  if(ops[0]?.op==='split'){
   const op=ops[0];
   const clip=value.tracks.flatMap(t=>t.clips??[]).find(c=>c.id===op.clip);
   if(!clip)throw Error('Clip not found');
   if(!['video','sound'].includes(kindOf(clip)))throw Error('MCP split currently supports only video or audio');
   if(!Array.isArray(clip.time)||clip.time.length!==2||!clip.time.every(Number.isFinite))throw Error('Explicit source trim [start,end] required before MCP split');
   const speed=clip.speed??1;
   const beginning=clip.at??0;
   const expectedAt=beginning+(op.time[1]-op.time[0])/speed;
   if(Math.abs(clip.time[0]-op.time[0])>0.002||Math.abs(clip.time[1]-op.restTime[1])>0.002||!Number.isFinite(expectedAt)||Math.abs(expectedAt-op.at)>0.002)throw Error('Split must match clip source trim, speed and timeline time');
  }
  const edited=applyOps(value,ops);
  const checked=readFilm(edited);
  if(!checked.doc)throw Error(checked.problems.join('; '));
  return {value:edited};
 },{ops});
 return {content:[{type:'text',text:JSON.stringify({status:'updated',revision:result.rev,...summary})}]};
}

async function timelineTool(name,args){
 const {rev,value,problems}=await readProjectFilm(project);
 if(!value)throw Error('Invalid film.html: '+problems.join('; ').slice(0,500));
 const tracks=value.tracks??[];
 const count=tracks.reduce((n,t)=>n+(t.clips?.length??0),0);
 if(name==='timeline_overview')return {content:[{type:'text',text:JSON.stringify({revision:rev,stage:value.stage,track_count:tracks.length,clip_count:count,tracks:tracks.map((t,i)=>({index:i,clip_count:t.clips?.length??0,locked:!!t.locked,hidden:!!t.hidden,muted:!!t.muted}))})}]};
 const track=args?.track;
 const limit=args?.limit??50;
 const offset=args?.offset??0;
 if(!Number.isInteger(offset)||offset<0)throw Error('Invalid offset');
 if(track!==undefined&&(!Number.isInteger(track)||track<0||track>=tracks.length))throw Error('Invalid track index');
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid limit');
 const chosen=track===undefined?tracks.map((t,i)=>({t,i})): [{t:tracks[track],i:track}];
 const all=chosen.flatMap(({t,i})=>(t.clips??[]).map(c=>({track:i,id:c.id??null,src:c.src??null,kind:kindOf(c),at:c.at??null,time:c.time??null,speed:c.speed??null})));
 return {content:[{type:'text',text:JSON.stringify({revision:rev,total:all.length,returned:Math.min(limit,Math.max(0,all.length-offset)),offset,next_offset:offset+limit<all.length?offset+limit:null,truncated:offset+limit<all.length,clips:all.slice(offset,offset+limit)})}]};
}

function send(value){process.stdout.write(JSON.stringify(value)+'\n')}
const rl=createInterface({input:process.stdin,crlfDelay:Infinity});
rl.on('line',async line=>{
 let msg;try{msg=JSON.parse(line)}catch{return}
 if(msg.id===undefined)return;
 try{
  let result;
  switch(msg.method){
   case 'initialize':result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'videomaker-media',version:'1.0.0'}};break;
   case 'ping':result={};break;
   case 'tools/list':result={tools};break;
   case 'tools/call':result=['timeline_move_clip','timeline_duplicate_clip','timeline_set_playback','timeline_split_clip'].includes(msg.params?.name)?await timelineEdit(msg.params.name,msg.params?.arguments):['timeline_overview','timeline_clips'].includes(msg.params?.name)?await timelineTool(msg.params.name,msg.params?.arguments):msg.params?.name==='reverse_video'?await reverseVideo(msg.params?.arguments):['music_analyze','music_overview','music_context','music_cues'].includes(msg.params?.name)?await musicTool(msg.params.name,msg.params?.arguments):msg.params?.name==='inspect_video'?await heavyJob(()=>inspect(msg.params.name,msg.params?.arguments)):await inspect(msg.params?.name,msg.params?.arguments);break;
   default:send({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Method not found'}});return;
  }
  send({jsonrpc:'2.0',id:msg.id,result});
 }catch(e){send({jsonrpc:'2.0',id:msg.id,result:{isError:true,content:[{type:'text',text:String(e.message||e)}]}})}
});
