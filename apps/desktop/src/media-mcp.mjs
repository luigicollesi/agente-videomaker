/** Local Media MCP server with read-only inspection and controlled video reversal. */
import { createInterface } from 'node:readline';
import { readFile, mkdtemp, rm, realpath, stat, lstat, link, open, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname, relative, isAbsolute, basename, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unlinkSync, existsSync } from 'node:fs';
import { readProjectFilm, changeProjectFilm } from 'openfilm/studio-film';
import { kindOf, readFilm, clipKind } from 'openfilm/film-doc';
import { applyOps } from 'openfilm/studio-ops';
import { listBoards, readCanvas, canvasRevision } from 'openfilm/studio-canvas';
import { searchLibrary, KINDS, LIBRARY_VERBS, libraryGet } from 'openfilm/library-search';
import { listText3D } from 'openfilm/text3d-registry';
import { propertyEdits, batchOps } from './mcp/timeline-actions.mjs';
import { readMotion } from 'openfilm/clip-motion';
import { captionTool } from './mcp/captions.mjs';
import { captionActions } from './mcp/caption-actions.mjs';
import { manageBoard } from './mcp/canvas-boards.mjs';
import { motionPresetList, motionPresetOps } from './mcp/motion-presets.mjs';
import { draftPath, draftFingerprint, recordPreview, requireVerifiedPreview } from './mcp/text3d-safety.mjs';
import { musicAudioStream, musicAnalysisOptions, musicCueOptions, musicDecodeOptions } from './mcp/music-options.mjs';
import { auditFilm } from './mcp/film-audit.mjs';
import { projectPage } from './mcp/project-pages.mjs';
import { timelineSource } from './mcp/timeline-source.mjs';

const project=resolve(process.env.VIDEOMAKER_PROJECT || process.cwd());
const require=createRequire(import.meta.url);
const images=new Set(['.jpg','.jpeg','.png','.webp']);
const videos=new Set(['.mp4','.mov','.webm','.mkv','.avi','.m4v']);
const pythonBinary=()=>process.env.VIDEOMAKER_PYTHON || (process.platform==='win32'?'python':'python3');
const schema={type:'object',properties:{path:{type:'string',description:'Media path inside project/assets'}} ,required:['path']};
const tools=[
 {name:'inspect_image',description:'Inspect an image from this project Media. Returns visual image content, not a filename description.',inputSchema:schema},
 {name:'inspect_video',description:'Inspect a video from this project Media. Returns timestamped image frames. Sampled frames do not guarantee exact event boundaries.',inputSchema:{type:'object',properties:{...schema.properties,start:{type:'number',minimum:0},end:{type:'number',minimum:0},max_frames:{type:'integer',minimum:1,maximum:24},frame_offset:{type:'integer',minimum:0,description:'Zero-based frame index for pagination'},frame_limit:{type:'integer',minimum:1,maximum:24,description:'Frames returned in this call; omit for legacy all-frames response'}},required:['path']}},
 {name:'library_search',description:'Search built-in free offline media library; concise ranked results, no terminal or copied assets.',inputSchema:{type:'object',properties:{kind:{type:'string',enum:['music','sound','transition','effect','filter','sticker','text','template']},query:{type:'string',minLength:1},limit:{type:'integer',minimum:1,maximum:20},duration:{type:'number',minimum:0}},required:['kind','query'],additionalProperties:false}},
 {name:'canvas_manage_board',description:'Create, rename or trash a Canvas board through authenticated Studio. Revision required for rename/delete; deletion needs explicit confirmation.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['create','rename','delete']},board:{type:'string'},revision:{type:'string'},name:{type:'string'},from:{type:'string'},from_revision:{type:'string'},confirm_delete:{type:'boolean'}},required:['action'],additionalProperties:false}},
 {name:'captions_transcribe',description:'Transcribe 1–3 pending audio sources via the configured Studio provider. May incur provider costs. Call only after explicit user approval.',inputSchema:{type:'object',properties:{srcs:{type:'array',items:{type:'string'},minItems:1,maxItems:3},external_approved:{type:'boolean'}},required:['srcs','external_approved'],additionalProperties:false}},
 {name:'captions_translate',description:'Translate film subtitles using the configured Studio provider. May incur costs; user approval required.',inputSchema:{type:'object',properties:{language:{type:'string'},external_approved:{type:'boolean'}},required:['language','external_approved'],additionalProperties:false}},
 {name:'caption_tracks',description:'Create native WebVTT caption tracks, synchronize spoken captions or translate a track. Returns only saved path. Translation requires user approval.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['new','from_subtitles','sync','translate']},revision:{type:'string'},src:{type:'string'},name:{type:'string'},label:{type:'string'},clips:{type:'array',items:{type:'string'},maxItems:30},text:{type:'string'},language:{type:'string'},external_approved:{type:'boolean'}},required:['action'],oneOf:[{properties:{action:{const:'new'}},required:['text']},{properties:{action:{const:'from_subtitles'}}},{properties:{action:{const:'sync'}},required:['revision']},{properties:{action:{const:'translate'},external_approved:{const:true}},required:['src','language','external_approved']}],additionalProperties:false}},
 {name:'caption_track_cues',description:'Read paginated plain-text WebVTT caption cues from project captions directory without loading full file.',inputSchema:{type:'object',properties:{src:{type:'string'},limit:{type:'integer',minimum:1,maximum:50},offset:{type:'integer',minimum:0}},required:['src'],additionalProperties:false}},
 {name:'canvas_list',description:'List canvas boards with compact node counts.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'canvas_apply',description:'Apply 1-30 native Canvas operations to an explicitly named board, guarding against stale revisions. Requires Studio.',inputSchema:{type:'object',properties:{board:{type:'string'},revision:{type:'string'},ops:{type:'array',items:{type:'object',required:['op'],properties:{op:{type:'string',enum:['add','set','remove','wire','unwire','version'],description:'Canvas native operations: add creates a node; set updates; remove deletes; wire/unwire connect nodes; version manages node versions. Node-specific fields remain validated by Studio.'}},additionalProperties:true},minItems:1,maxItems:30}},required:['ops'],additionalProperties:false}},
 {name:'canvas_nodes',description:'Read a board as compact paged node summaries, or one full node and its connections by id.',inputSchema:{type:'object',properties:{board:{type:'string'},node:{type:'string'},limit:{type:'integer',minimum:1,maximum:50},offset:{type:'integer',minimum:0}},additionalProperties:false}},
 {name:'library_take',description:'Import one free library asset into this project, using the built-in get --take engine. Does not insert into timeline.',inputSchema:{type:'object',properties:{kind:{type:'string',enum:['music','sound','transition','effect','filter','sticker','text','template']},id:{type:'string',minLength:1,maxLength:500}},required:['kind','id'],additionalProperties:false}},
 {name:'timeline_set_properties',description:'Atomically edit 1-30 whitelisted clip properties (trim, position, box, fade, volume, speed, motion) with current revision; rejects invalid steps.',inputSchema:{type:'object',properties:{revision:{type:'string'},edits:{type:'array',minItems:1,maxItems:30,items:{type:'object',properties:{clip:{type:'string'},prop:{type:'string',enum:['at','start','end','speed','volume','fade','disabled','box','size','motion'],description:'at/start: 0..86400; end: .001..86400; speed: .1..100; volume: 0..4; fade: [start,end]; disabled: boolean; box: x,y with optional w,h,r; size: integer w,h 1..8192; motion: translate/scale/rotate/opacity keyframe arrays. null resets properties.'},value:{description:'Value is validated according to prop by the timeline engine; use null to clear.'}},required:['clip','prop','value'],additionalProperties:false}}},required:['revision','edits'],additionalProperties:false}},
 {name:'timeline_apply_batch',description:'Atomically apply 1-25 timeline steps: move, duplicate, remove, insert_asset, props, track flags and stage. Insert local HTML scenes or assets media; omit track for native automatic track choice. Revision required; rollback on failure.',inputSchema:{type:'object',properties:{revision:{type:'string'},steps:{type:'array',minItems:1,maxItems:25,items:{type:'object',required:['op'],properties:{op:{type:'string',enum:['move','duplicate','remove','insert_asset','props','track','stage'],description:'move: clip,at[,track]; duplicate: from,at[,track]; remove: clip; insert_asset: path,at[,time,track,id]; props: edits; track: track,field(locked|hidden|muted),value(boolean); stage: w,h. Clip IDs start with a letter; times 0..86400; track 0..1000.'}},additionalProperties:true}}},required:['revision','steps'],additionalProperties:false}},
 {name:'timeline_get_motion',description:'Read one clip’s translate/scale/rotate/opacity keyframes compactly with current film revision.',inputSchema:{type:'object',properties:{clip:{type:'string'}},required:['clip'],additionalProperties:false}},
 {name:'motion_presets',description:'List compact built-in motion presets usable on video, images and pages; filter by in/out/loop.',inputSchema:{type:'object',properties:{slot:{type:'string',enum:['in','out','loop']},limit:{type:'integer',minimum:1,maximum:30},offset:{type:'integer',minimum:0}},additionalProperties:false}},
 {name:'timeline_apply_motion_preset',description:'Apply an official motion preset to one clip, or remove a slot with preset_id:null; requires exact film revision and respects locked tracks.',inputSchema:{type:'object',properties:{revision:{type:'string'},clip:{type:'string'},slot:{type:'string',enum:['in','out','loop']},preset_id:{type:['string','null']},seconds:{type:'number',minimum:0.05,maximum:60}},required:['revision','clip','slot','preset_id'],additionalProperties:false}},
 {name:'captions_list',description:'Read compact time-filtered captions with transcript line IDs, languages and pagination; preserves source synchronization.',inputSchema:{type:'object',properties:{start:{type:'number',minimum:0},end:{type:'number',exclusiveMinimum:0},limit:{type:'integer',minimum:1,maximum:50},offset:{type:'integer',minimum:0}},additionalProperties:false}},
 {name:'captions_style',description:'Get subtitle style and style revision or patch allowed style fields via the authenticated Studio. action=get|patch; patch requires style_revision.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['get','patch']},style_revision:{type:'string'},changes:{type:'object'}},required:['action'],additionalProperties:false}},
 {name:'captions_correct_line',description:'Correct one source transcript line/segment via Studio. Requires film revision, source/line ID and expected current text; keeps word timing.',inputSchema:{type:'object',properties:{revision:{type:'string'},src:{type:'string'},line:{type:'integer',minimum:0},part:{type:'integer',minimum:0},text:{type:'string'},expected_text:{type:'string'},language:{type:'string'}},required:['revision','src','line','text','expected_text'],additionalProperties:false}},
 {name:'timeline_get_clip',description:'Read a single timeline clip with fields and current revision without dumping film.html.',inputSchema:{type:'object',properties:{clip:{type:'string'}},required:['clip'],additionalProperties:false}},
 {name:'timeline_insert_asset',description:'Insert an existing media file from assets/ or a project-local HTML scene; omit track for automatic track creation. Guarded by film revision.',inputSchema:{type:'object',properties:{path:{type:'string'},revision:{type:'string'},at:{type:'number',minimum:0},track:{type:'integer',minimum:0},time:{type:'array',items:{type:'number'},minItems:2,maxItems:2}},required:['path','revision','at'],additionalProperties:false}},
 {name:'timeline_remove_clip',description:'Remove one clip from the timeline with strict revision check; does not delete its source asset.',inputSchema:{type:'object',properties:{clip:{type:'string'},revision:{type:'string'}},required:['clip','revision'],additionalProperties:false}},
 {name:'project_page_update',description:'Inspect SHA-256/linked clips or make 1-8 exact source replacements in an existing procedural HTML page used by the film. Refuses locked tracks, stale content and external paths.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['inspect','replace']},path:{type:'string'},expected_sha256:{type:'string',pattern:'^[a-f0-9]{64},items:{type:'object',properties:{find:{type:'string'},replace:{type:'string'}},required:['find','replace'],additionalProperties:false}}},required:['action','path'],oneOf:[{properties:{action:{const:'inspect'}}},{properties:{action:{const:'replace'}},required:['expected_sha256','revision','changes']}],additionalProperties:false}},
 {name:'film_audit',description:'Read-only film integrity check: verified explicit durations, unknown durations, missing sources, and optional expected duration. Never guesses media length.',inputSchema:{type:'object',properties:{expected_seconds:{type:'number',minimum:0,maximum:86400}},additionalProperties:false}},
 {name:'film_preview_range',description:'Native deterministic contact-sheet inspection across a bounded timeline range. Returns verified PNG and warnings; render requires browser/FFmpeg.',inputSchema:{type:'object',properties:{start:{type:'number',minimum:0},end:{type:'number',exclusiveMinimum:0},count:{type:'integer',minimum:2,maximum:12}},required:['start','end'],additionalProperties:false}},
 {name:'film_preview_frame',description:'Render one frame of the current film using native look; returns concise checks and one PNG when small enough. Requires an openable browser/FFmpeg.',inputSchema:{type:'object',properties:{at:{type:'number',minimum:0}},required:['at'],additionalProperties:false}},
 {name:'film_render',description:'Render the project with native renderer into a NEW file in assets. Requires revision; atomic exclusive publication. Heavy operation.',inputSchema:{type:'object',properties:{revision:{type:'string'},output:{type:'string'},start:{type:'number',minimum:0},end:{type:'number',exclusiveMinimum:0},fps:{type:'number',minimum:1,maximum:60}},required:['revision','output'],additionalProperties:false}},
 {name:'timeline_overview',description:'Read-only overview of the current project film, its revision, stage and number of tracks/clips.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'timeline_split_clip',description:'Split one clip using explicit source-time intervals and timeline second, as required by Studio. Current revision required. Source timings must be provided accurately.',inputSchema:{type:'object',properties:{clip:{type:'string'},revision:{type:'string'},at:{type:'number',exclusiveMinimum:0},left_time:{type:'array',items:{type:'number'},minItems:2,maxItems:2},right_time:{type:'array',items:{type:'number'},minItems:2,maxItems:2}},required:['clip','revision','at'],additionalProperties:false}},
 {name:'timeline_set_playback',description:'Set clip playback speed (0.1..100) or volume (0..4) using Studio. Requires current revision.',inputSchema:{type:'object',properties:{clip:{type:'string'},revision:{type:'string'},field:{type:'string',enum:['speed','volume']},value:{type:'number'}},required:['clip','revision','field','value'],oneOf:[{properties:{field:{const:'speed'},value:{type:'number',minimum:0.1,maximum:100}}},{properties:{field:{const:'volume'},value:{type:'number',minimum:0,maximum:4}}}],additionalProperties:false}},
 {name:'timeline_duplicate_clip',description:'Duplicate an existing clip at a nonnegative timeline second using Studio, requiring an exact current revision.',inputSchema:{type:'object',properties:{clip:{type:'string'},at:{type:'number',minimum:0},revision:{type:'string'}},required:['clip','at','revision'],additionalProperties:false}},
 {name:'timeline_move_clip',description:'Move one clip to a nonnegative timeline second using the Studio edit engine. Requires current revision returned by timeline_overview; stale revisions are refused.',inputSchema:{type:'object',properties:{clip:{type:'string'},at:{type:'number',minimum:0},revision:{type:'string'}},required:['clip','at','revision'],additionalProperties:false}},
 {name:'timeline_clips',description:'Read-only bounded list of clips from the current film, with IDs, source, kind and timeline/source timing.',inputSchema:{type:'object',properties:{track:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100},offset:{type:'integer',minimum:0}},additionalProperties:false}},
 {name:'text3d_list',description:'List registered reusable 3D text components, with compact metadata and optional source filter.',inputSchema:{type:'object',properties:{source_id:{type:'string'},limit:{type:'integer',minimum:1,maximum:50},offset:{type:'integer',minimum:0}},additionalProperties:false}},
 {name:'text3d_inspect',description:'Read registered Text3D component metadata and editable parameters without reading its bundled source files.',inputSchema:{type:'object',properties:{component_id:{type:'string'}},required:['component_id'],additionalProperties:false}},
 {name:'text3d_create',description:'Create a scoped Text3D draft under .film/text3d-drafts with the existing authoring engine.',inputSchema:{type:'object',properties:{name:{type:'string',maxLength:50}},required:['name'],additionalProperties:false}},
 {name:'text3d_preview',description:'Bundle and verify a Text3D draft using the native Three.js pipeline. To regenerate after edits, set replace_preview=true.',inputSchema:{type:'object',properties:{folder:{type:'string'},replace_preview:{type:'boolean'}},required:['folder'],additionalProperties:false}},
 {name:'text3d_font_add',description:'Add one installed upright TrueType font to a scoped Text3D draft; re-preview after changing the draft.',inputSchema:{type:'object',properties:{folder:{type:'string'},family:{type:'string'},weight:{type:'integer',minimum:1,maximum:1000}},required:['folder','family'],additionalProperties:false}},
 {name:'text3d_register',description:'Publish an unchanged preview-verified Text3D draft to Saved. Requires explicit visual approval. Never call automatically after preview.',inputSchema:{type:'object',properties:{folder:{type:'string'},visual_approved:{type:'boolean'}},required:['folder','visual_approved'],additionalProperties:false}},
 {name:'text3d_apply',description:'Apply an already registered Text3D component to a specific unlocked clip with exact film revision; verifies imported bundle.',inputSchema:{type:'object',properties:{revision:{type:'string'},clip:{type:'string'},component_id:{type:'string'}},required:['revision','clip','component_id'],additionalProperties:false}},
 {name:'text3d_validate',description:'Structurally validate a draft in this project .film/text3d-drafts directory without registering or modifying clips.',inputSchema:{type:'object',properties:{folder:{type:'string'}},required:['folder'],additionalProperties:false}},
 {name:'music_inspect',description:'Inspect available audio streams from local WAV/MP3/MP4 without full acoustic analysis.',inputSchema:{type:'object',properties:{...schema.properties,audio_stream:{type:'integer',minimum:0,maximum:64}},required:['path'],additionalProperties:false}},
 {name:'music_validate',description:'Validate acoustic analysis JSON timestamps and structure; reports valid or invalid, does not modify file.',inputSchema:schema},
 {name:'music_compare',description:'Compact comparison of two time windows in an existing acoustic analysis.',inputSchema:{type:'object',properties:{path:schema.properties.path,start_a:{type:'number',minimum:0},end_a:{type:'number',exclusiveMinimum:0},start_b:{type:'number',minimum:0},end_b:{type:'number',exclusiveMinimum:0}},required:['path','start_a','end_a','start_b','end_b'],additionalProperties:false}},
 {name:'music_analyze',description:'Offline acoustic analysis to new JSON; optionally select audio stream, reuse local cache or enable experimental structural matching.',inputSchema:{type:'object',properties:{path:schema.properties.path,output:{type:'string',description:'New JSON in project/assets'},audio_stream:{type:'integer',minimum:0,maximum:64},use_cache:{type:'boolean'},experimental_structure_v3:{type:'boolean'}},required:['path','output'],additionalProperties:false}},
 {name:'music_decode',description:'Decode a local audio source to new mono f32le PCM + metadata JSON in assets. Returns paths and sizes only; never includes PCM bytes.',inputSchema:{type:'object',properties:{path:schema.properties.path,pcm_output:{type:'string'},metadata_output:{type:'string'},audio_stream:{type:'integer',minimum:0,maximum:64},sample_rate:{type:'integer',minimum:8000,maximum:48000}},required:['path','pcm_output','metadata_output'],additionalProperties:false}},
 {name:'music_overview',description:'Get compact BPM, dynamics and structure overview from an existing analysis JSON.',inputSchema:schema},
 {name:'music_context',description:'Get acoustic context of a time interval from an existing analysis JSON.',inputSchema:{type:'object',properties:{...schema.properties,start:{type:'number',minimum:0},end:{type:'number',exclusiveMinimum:0}},required:['path','start','end']}},
 {name:'music_cues',description:'Select and merge bounded acoustic editing cues by category, strength, and representative/chronological order.',inputSchema:{type:'object',properties:{...schema.properties,start:{type:'number',minimum:0},end:{type:'number',exclusiveMinimum:0},limit:{type:'integer',minimum:1,maximum:100},categories:{type:'array',items:{type:'string',enum:['beat','onset','strong_onset','energy','harmonic_change','structure_boundary']},minItems:1,maxItems:6},selection:{type:'string',enum:['representative','chronological']},min_relative_strength:{type:'number',minimum:0,maximum:1},merge_coincident:{type:'boolean'},merge_window_ms:{type:'number',minimum:0,maximum:250}},required:['path','start','end'],additionalProperties:false}},
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
  try{const killed=spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:10000});if(killed.status===0)return}catch{/* process already ended */}
  try{child.kill('SIGKILL')}catch{/* process already ended */}
  return;
 }
 if(child.pid){try{process.kill(-child.pid,'SIGKILL');return}catch{/* group already ended */}}
 try{child.kill('SIGKILL')}catch{/* child already ended */}
}
function exec(name,args,timeout=30000,env=process.env,acceptedCodes=[0],cwd=undefined){
 return new Promise((resolve,reject)=>{
  const child=spawn(name,args,{stdio:['ignore','pipe','pipe'],env,cwd,detached:process.platform!=='win32'});
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
   if(!acceptedCodes.includes(code))return reject(Error(Buffer.concat(err).toString().slice(0,600)||name+' failed'));
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
  if((await stat(path)).size>15_000_000)throw Error('Image exceeds 15 MB');
  const data=await readFile(path);
  if(data.length>15_000_000)throw Error('Image exceeds 15 MB');
  return {content:[image(data,extname(path).toLowerCase()==='.png'?'image/png':extname(path).toLowerCase()==='.webp'?'image/webp':'image/jpeg')]};
 }
 if(name!=='inspect_video')throw Error('Unknown tool');
 const probe=JSON.parse((await exec('ffprobe',['-v','error','-show_entries','format=duration','-of','json',path])).toString());
 const duration=Number(probe.format?.duration);
 const start=args?.start??0,end=args?.end??duration,n=args?.max_frames??12;
 const offset=args?.frame_offset??0,limit=args?.frame_limit??n;
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>duration+.01||end<=start||!Number.isInteger(n)||n<1||n>24||!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>24)throw Error('Invalid interval or frame count');
 const folder=await mkdtemp(join(tmpdir(),'videomaker-media-mcp-'));
 try{
  const content=[];
  for(let i=offset;i<Math.min(n,offset+limit);i++){
   const time=start+(Math.min(end,duration)-start)*(i+.5)/n;
   const dest=join(folder,`frame-${i}.jpg`);
   await exec('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-ss',time.toFixed(5),'-i',path,'-frames:v','1','-vf','scale=960:-2:force_original_aspect_ratio=decrease','-q:v','4',dest],15000);
   content.push({type:'text',text:`Frame ${i+1}/${n} at ${time.toFixed(3)} seconds`});
   content.push(image(await readFile(dest),'image/jpeg'));
  }
  const returned=Math.max(0,Math.min(n,offset+limit)-offset);
  content.push({type:'text',text:JSON.stringify({total_frames:n,frame_offset:offset,returned_frames:returned,remaining_frames:Math.max(0,n-offset-returned),next_frame_offset:offset+returned<n?offset+returned:null})});
  return {content};
 }finally{await rm(folder,{recursive:true,force:true})}
}

async function safeOutput(raw,extension='.mp4'){
 if(typeof raw!=='string'||!raw.trim())throw Error('Missing output path');
 const base=await realpath(join(project,'assets'));
 const lexical=resolve(project,raw);
 if(extname(lexical).toLowerCase()!==extension)throw Error('Output must be '+extension);
 const parent=await realpath(dirname(lexical));
 const rel=relative(base,parent);
 if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('Output must be inside project/assets');
 const dest=join(parent,basename(lexical));
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
 const archiveScript=resolve(dirname(modulePath),'../manual/media/scripts/reverse-video.py');
 const unpackedScript=archiveScript.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
 const script=unpackedScript!==archiveScript && existsSync(unpackedScript)?unpackedScript:archiveScript;
 const cli=[script,input,output,'--audio',audio];
 if(args?.start!==undefined)cli.push('--start',String(args.start));
 if(args?.end!==undefined)cli.push('--end',String(args.end));
 await heavyJob(()=>exec(pythonBinary(),cli,600000));
 return {content:[{type:'text',text:JSON.stringify({status:'created',path:relative(project,output),audio})}]};
}


const musicSources=new Set(['.wav','.mp3','.mp4']);
const analysisFiles=new Set(['.json']);
function musicRuntime(){
 const bundled=process.resourcesPath && join(process.resourcesPath,'music-analyzer','src');
 const development=resolve(dirname(require.resolve('openfilm/skills')),'../../music-analyzer/src');
 const src=process.env.VIDEOMAKER_MUSIC_ANALYZER_SRC || (bundled && existsSync(bundled)?bundled:development);
 const existing=process.env.PYTHONPATH;
 return { ...process.env, PYTHONPATH:existing?[src,existing].join(process.platform==='win32'?';':':'):src };
}
function intervalArgs(args){
 if(!Number.isFinite(args?.start)||!Number.isFinite(args?.end)||args.start<0||args.end<=args.start)throw Error('Invalid interval');
 return ['--start',String(args.start),'--end',String(args.end)];
}
async function musicTool(name,args){
 let cli;
 if(name==='music_inspect'){
  const input=await safePath(args?.path,musicSources);
  const bytes=await exec(pythonBinary(),['-m','music_analyzer.cli','inspect',input,...musicAudioStream(args)],60000,musicRuntime());
  let result;try{result=JSON.parse(bytes.toString('utf8'))}catch{throw Error('Music inspect returned invalid JSON')}
  return {content:[{type:'text',text:JSON.stringify(result).slice(0,8500)}]};
 }
 if(name==='music_decode'){
  const input=await safePath(args?.path,musicSources);
  const pcm=await safeOutput(args?.pcm_output,'.f32le');
  const metadata=await safeOutput(args?.metadata_output,'.json');
  if(pcm===metadata)throw Error('PCM and metadata must have separate file paths');
  const options=musicDecodeOptions(args);
  return heavyJob(async()=>{
   const tmp=await mkdtemp(join(dirname(pcm),'.music-mcp-decode-'));
   try{
    const pcmTemp=join(tmp,'decoded.f32le'),metaTemp=join(tmp,'metadata.json');
    const response=await exec(pythonBinary(),['-m','music_analyzer.cli','decode',input,'--pcm-output',pcmTemp,'--metadata-output',metaTemp,...options],600000,musicRuntime());
    let result;
    try{result=JSON.parse(response.toString('utf8'))}catch{throw Error('Music decode returned invalid JSON')}
    if(result.status!=='decoded_only')throw Error('Music decoder returned unexpected status');
    const [pcmStats,metaStats]=await Promise.all([stat(pcmTemp),stat(metaTemp)]);
    if(pcmStats.size<4||pcmStats.size>512*1024*1024||metaStats.size<2||metaStats.size>256*1024)throw Error('Decoded PCM/metadata failed size validation');
    // Both final paths are exclusive. Undo first hardlink if second cannot be published.
    await link(pcmTemp,pcm);
    try{await link(metaTemp,metadata)}catch(e){await rm(pcm,{force:true});throw e}
    return {content:[{type:'text',text:JSON.stringify({status:'decoded',pcm_path:relative(project,pcm),metadata_path:relative(project,metadata),pcm_bytes:pcmStats.size,metadata_bytes:metaStats.size,sample_rate:args?.sample_rate??22050,stream:args?.audio_stream??null,next:'PCM is kept on disk; use music_analyze for acoustic features'})}]};
   }finally{
    await rm(tmp,{recursive:true,force:true});
   }
  });
 }
 if(name==='music_analyze'){
  const input=await safePath(args?.path,musicSources);
  const output=await safeOutput(args?.output,'.json');
  cli=['analyze',input,'--output',output];
  // Only a private cache folder under the project is permitted.
  let cachePath;
  if(args?.use_cache===true){
   const projectRoot=await realpath(project);
   const stateDir=join(projectRoot,'.film');
   await mkdir(stateDir,{recursive:true});
   const canonicalState=await realpath(stateDir);
   if(canonicalState!==stateDir)throw Error('Music cache requires a local project .film directory');
   const cacheDir=join(canonicalState,'music-analyzer-cache');
   await mkdir(cacheDir,{recursive:true});
   cachePath=await realpath(cacheDir);
   const rel=relative(projectRoot,cachePath);
   if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('Analyzer cache must stay in this project');
  }
  cli.push(...musicAnalysisOptions(args,cachePath));
 } else {
  const file=await safePath(args?.path,analysisFiles);
  cli=[name==='music_validate'?'validate':name==='music_compare'?'compare':name==='music_overview'?'overview':name==='music_context'?'context':'cues',file];
  if(name==='music_context'||name==='music_cues')cli.push(...intervalArgs(args));
  if(name==='music_compare'){
   for(const suffix of ['a','b']){
    const start=args?.['start_'+suffix],end=args?.['end_'+suffix];
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw Error('Invalid music comparison interval');
    cli.push('--start-'+suffix,String(start),'--end-'+suffix,String(end));
   }
  }
  if(name==='music_cues'){
   const limit=args?.limit??30;
   if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid cue limit');
   cli.push('--limit',String(limit));
   cli.push(...musicCueOptions(args));
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
    return {content:[{type:'text',text:JSON.stringify({status:output.status??'analyzed',validated:true,output_path:relative(project,destination),warnings:Array.isArray(output.warnings)?output.warnings.slice(0,4):[],next:'Use music_overview or music_context for compact results'})}]};
   }finally{await rm(folder,{recursive:true,force:true})}
  });
 }
 const data=await exec(python,['-m','music_analyzer.cli',...cli],60000,musicRuntime(),name==='music_validate'?[0,2]:[0]);
 let output;
 try{output=JSON.parse(data.toString('utf8'))}catch{throw Error('Music analyzer returned invalid JSON')}
 return {content:[{type:'text',text:JSON.stringify(output)}]};
}


async function libraryTool(args){
 if(!Object.hasOwn(KINDS,args?.kind)||typeof args?.query!=='string'||!args.query.trim()||args.query.length>500)throw Error('Invalid library category or query');
 const limit=args?.limit??6;
 if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('Invalid library result limit');
 if(args?.duration!==undefined&&(!Number.isFinite(args.duration)||args.duration<0||args.duration>3600))throw Error('Invalid requested duration');
 const found=await searchLibrary(args.kind,args.query.trim(),{limit,duration:args.duration});
 const results=found.found.map(({item})=>({
  id:item.id,name:item.name?.en??item.id,kind:item.kind,
  ...(item.durationMs!=null?{duration_seconds:Math.round(item.durationMs/1000*10)/10}:{}),
  ...(item.bpm!=null?{bpm:item.bpm}:{}),
  ...(item.energy!=null?{energy:item.energy}:{}),
  ...(item.loop!=null?{loop:item.loop}:{})
 }));
 return {content:[{type:'text',text:JSON.stringify({kind:args.kind,query:args.query,worded:found.worded,count:results.length,results})}]};
}
async function libraryTake(args){
 if(!Object.hasOwn(KINDS,args?.kind)||typeof args?.id!=='string'||!args.id.trim()||args.id.length>500)throw Error('Invalid library item');
 const verb=Object.keys(LIBRARY_VERBS).find(v=>LIBRARY_VERBS[v].kind===args.kind);
 if(!verb)throw Error('Unsupported library category');
 if(!(await stat(join(project,'film.html')).catch(()=>null))?.isFile())throw Error('A film.html project is required');
 const response=await libraryGet(verb,{take:args.id},project);
 if(response.code!==0)throw Error(response.lines?.join(' ').slice(0,600)||'Library import failed');
 return {content:[{type:'text',text:JSON.stringify({status:'completed',kind:args.kind,id:args.id,details:(response.lines??[]).slice(0,8).map(line=>line.slice(0,500))})}]};
}
async function runText3D(name,args){
 let command,revision=null,folder=null;
 if(name==='text3d_apply'){
  if(typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision)||typeof args?.clip!=='string'||!args.clip.trim()||
     typeof args?.component_id!=='string'||!args.component_id.trim())throw Error('Invalid Text3D apply arguments');
  const film=await readProjectFilm(project);
  if(!film.value||film.rev!==args.revision)throw Error('Stale film revision; inspect again');
  const track=film.value.tracks.find(t=>(t.clips??[]).some(c=>c.id===args.clip));
  if(!track)throw Error('Clip not found');
  if(track.locked)throw Error('Cannot modify a locked track');
  if(!(await listText3D()).some(entry=>entry.componentId===args.component_id))throw Error('Text3D component is not registered');
  command=['apply',project,args.clip,args.component_id];
  revision=args.revision;
 }else{
  folder=await draftPath(project,args?.folder);
  if(name==='text3d_font_add'){
   if(typeof args.family!=='string'||!args.family.trim()||args.family.length>100||
      args.weight!==undefined&&(!Number.isInteger(args.weight)||args.weight<1||args.weight>1000))throw Error('Invalid Text3D font');
   command=['font-add',folder,args.family.trim(),String(args.weight??400)];
  }else{
   if(args?.visual_approved!==true)throw Error('Visual approval is required before publishing Text3D');
   command=['register',folder];
  }
 }
 return heavyJob(async()=>{
  if(name==='text3d_register')await requireVerifiedPreview(folder);
  const job={kind:'text3d-command',root:project,args:command,...(revision?{revision}:{})};
  const worker=fileURLToPath(new URL('./film-mcp-worker.mjs',import.meta.url));
  const bytes=await exec(process.execPath,[worker,JSON.stringify(job)],600000,{...process.env,ELECTRON_RUN_AS_NODE:'1'},[0],project);
  const log=bytes.toString('utf8'),marker='MCP_FILM_RESULT=',pos=log.lastIndexOf(marker);
  if(pos<0)throw Error('Text3D worker returned no completion receipt');
  let result;
  try{result=JSON.parse(log.slice(pos+marker.length).split('\n')[0])}catch{throw Error('Invalid Text3D worker receipt')}
  if(name==='text3d_apply'&&!/^[a-f0-9]{16}$/.test(result.revision??''))throw Error('Text3D apply returned no film revision');
  return {content:[{type:'text',text:JSON.stringify({
   status:name==='text3d_register'?'registered':name==='text3d_apply'?'applied':'font_added',
   ...(result.revision?{revision:result.revision}:{}),
   notes:(result.lines??[]).slice(0,3).map(x=>String(x).slice(0,250)),
   ...(name==='text3d_font_add'?{next:'Run text3d_preview with replace_preview:true before registering'}:{})
  })}]};
 });
}
async function text3dTool(name,args){
 if(name==='text3d_create'){
  if(typeof args?.name!=='string'||!/^[a-z][a-z0-9_-]{0,49}$/.test(args.name))throw Error('Invalid Text3D draft name');
  const parent=join(project,'.film','text3d-drafts');
  await mkdir(parent,{recursive:true});
  const base=await realpath(project),actualParent=await realpath(parent);
  const relParent=relative(base,actualParent);
  if(!relParent||relParent==='..'||relParent.startsWith('..'+sep)||isAbsolute(relParent))throw Error('Text3D draft directory must stay in the project');
  const folder=join(actualParent,args.name);
  if(await stat(folder).catch(()=>null))throw Error('Text3D draft already exists');
  const { text3DCommand }=await import('openfilm/text3d-cli');
  const made=await text3DCommand(['create',folder]);
  if(!made.ok)throw Error((made.lines??[]).join(' ').slice(0,500));
  return {content:[{type:'text',text:JSON.stringify({status:'created',folder:relative(project,folder),next:'Edit draft, then call text3d_validate'})}]};
 }
 if(name==='text3d_preview'){
  const target=await draftPath(project,args?.folder);
  return heavyJob(async()=>{
   const sourceBefore=await draftFingerprint(target);
   if(args?.replace_preview===true){
    const previous=target+'-preview';
    const info=await lstat(previous).catch(error=>{if(error?.code==='ENOENT')return null;throw error});
    if(info){
     if(!info.isDirectory()||info.isSymbolicLink())throw Error('Existing preview is not a regular folder');
     await rm(previous,{recursive:true});
    }
   }else if(args?.replace_preview!==undefined&&args.replace_preview!==false){
    throw Error('replace_preview must be a boolean');
   }
   const job={kind:'text3d-preview',root:project,source:target};
   const worker=fileURLToPath(new URL('./film-mcp-worker.mjs',import.meta.url));
   const bytes=await exec(process.execPath,[worker,JSON.stringify(job)],240000,{...process.env,ELECTRON_RUN_AS_NODE:'1',OPENFILM_NO_BROWSER:'1'},[0],project);
   const log=bytes.toString('utf8'),marker='MCP_FILM_RESULT=',pos=log.lastIndexOf(marker);
   if(pos<0)throw Error('Text3D preview worker returned no receipt');
   let result;try{result=JSON.parse(log.slice(pos+marker.length).split('\n')[0])}catch{throw Error('Invalid Text3D preview receipt')}
   const page=await realpath(result.preview);
   const relativePage=relative(root,page);
   if(relativePage==='..'||relativePage.startsWith('..'+sep)||isAbsolute(relativePage))throw Error('Text3D preview escapes project');
   if(await draftFingerprint(target)!==sourceBefore)throw Error('Text3D source changed during preview; verify again');
   await recordPreview(target);
   return {content:[{type:'text',text:JSON.stringify({status:'preview_bundled',preview_page:relativePage,notes:(result.lines??[]).slice(0,3).map(v=>String(v).slice(0,250)),next:'Inspect rendered frames before registering'})}]};
  });
 }
 if(name==='text3d_validate'){
  if(typeof args?.folder!=='string'||!args.folder.trim())throw Error('Invalid Text3D draft folder');
  const base=await realpath(join(project,'.film','text3d-drafts'));
  const root=await realpath(project),relBase=relative(root,base);
  if(!relBase||relBase==='..'||relBase.startsWith('..'+sep)||isAbsolute(relBase))throw Error('Text3D drafts directory escapes project');
  const target=await realpath(resolve(project,args.folder));
  const rel=relative(base,target);
  if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('Text3D drafts must be inside .film/text3d-drafts');
  if(!(await stat(target)).isDirectory())throw Error('Text3D draft is not a directory');
  const { text3DCommand }=await import('openfilm/text3d-cli');
  const validation=await text3DCommand(['validate',target]);
  if(!validation.ok)throw Error((validation.lines??[]).join(' ').slice(0,700));
  return {content:[{type:'text',text:JSON.stringify({valid:true,folder:relative(project,target),message:(validation.lines??[]).join(' ').slice(0,450)})}]};
 }
 const entries=await listText3D();
 if(name==='text3d_inspect'){
  if(typeof args?.component_id!=='string'||!args.component_id.trim())throw Error('Invalid Text3D component ID');
  const entry=entries.find(e=>e.componentId===args.component_id);
  if(!entry)throw Error('Text3D component not found');
  const params=Object.entries(entry.parameterMap??{});
  return {content:[{type:'text',text:JSON.stringify({component_id:entry.componentId,source_id:entry.source2DId,display_name:entry.displayName,parameter_map:Object.fromEntries(params.slice(0,40)),parameters_truncated:params.length>40,bundle_path:entry.bundlePath,active:entry.active})}]};
 }
 if(args?.source_id!==undefined&&(typeof args.source_id!=='string'||args.source_id.length>150))throw Error('Invalid source filter');
 const limit=args?.limit??12,offset=args?.offset??0;
 if(!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(offset)||offset<0)throw Error('Invalid Text3D pagination');
 const chosen=args?.source_id?entries.filter(e=>e.source2DId===args.source_id):entries;
 const results=chosen.slice(offset,offset+limit).map(e=>({component_id:e.componentId,source_id:e.source2DId,display_name:e.displayName,active:e.active}));
 return {content:[{type:'text',text:JSON.stringify({total:chosen.length,offset,returned:results.length,next_offset:offset+limit<chosen.length?offset+limit:null,components:results})}]};
}

async function filmTool(name,args){
 if(!(await stat(join(project,'film.html')).catch(()=>null))?.isFile())throw Error('A film.html project is required');
 const worker=new URL('./film-mcp-worker.mjs',import.meta.url);
 const isRender=name==='film_render';
 const isRange=name==='film_preview_range';
 let output,revision,job,staging;
 if(isRender){
  if(typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision))throw Error('Invalid film revision');
  if(typeof args?.output!=='string'||!['.mp4','.webm','.mov'].includes(extname(args.output).toLowerCase()))throw Error('Output must be a new MP4, WebM or MOV');
  const hasRange=args.start!==undefined||args.end!==undefined;
  if(hasRange&&(!Number.isFinite(args.start)||!Number.isFinite(args.end)||args.start<0||args.end<=args.start))throw Error('Invalid export interval');
  if(args?.fps!==undefined&&(!Number.isFinite(args.fps)||args.fps<1||args.fps>60))throw Error('Invalid export FPS');
  const current=await readProjectFilm(project);
  if(!current.value||current.rev!==args.revision)throw Error('Stale or invalid film revision; inspect again');
  revision=current.rev;
  output=await safeOutput(args.output,extname(args.output).toLowerCase());
  job={kind:'render',root:project,range:hasRange?[args.start,args.end]:null,fps:args.fps??30};
 }else if(isRange){
  if(!Number.isFinite(args?.start)||!Number.isFinite(args?.end)||args.start<0||args.end<=args.start||
     args.end>86400||!Number.isInteger(args?.count??6)||(args.count??6)<2||(args.count??6)>12)throw Error('Invalid contact sheet range');
  job={kind:'look-range',root:project,start:args.start,end:args.end,count:args.count??6};
 }else{
  if(!Number.isFinite(args?.at)||args.at<0)throw Error('Invalid preview time');
  job={kind:'look',root:project,at:args.at};
 }
 return heavyJob(async()=>{
  try{
   if(isRender){
    // Render into a private sibling; link only after validation so a competing file cannot be replaced.
    staging=await mkdtemp(join(dirname(output),'.film-mcp-render-'));
    job.out=join(staging,'output'+extname(output).toLowerCase());
   }
   const bytes=await exec(process.execPath,[fileURLToPath(worker),JSON.stringify(job)],isRender?3600000:180000,{...process.env,ELECTRON_RUN_AS_NODE:'1',OPENFILM_NO_BROWSER:'1'},[0],project);
   const log=bytes.toString('utf8');
   const marker='MCP_FILM_RESULT=';
   const offset=log.lastIndexOf(marker);
   if(offset<0)throw Error('Film worker returned no completion receipt');
   let finished;
   try{finished=JSON.parse(log.slice(offset+marker.length).split('\n')[0])}catch{throw Error('Film worker receipt was not JSON')}
   if(isRender){
    const size=(await stat(job.out)).size;
    if(size===0)throw Error('Rendered file is empty');
    const current=await readProjectFilm(project);
    if(current.rev!==revision)throw Error('Film changed while rendering; render result not published');
    await link(job.out,output);
    return {content:[{type:'text',text:JSON.stringify({status:'rendered',revision,output:relative(project,output),bytes:size,encoder:finished.encoder,notes:(finished.lines??[]).slice(1,5).map(line=>String(line).slice(0,180))})}]};
   }
   const files=[];
   const canonicalProject=await realpath(project);
   for(const candidate of finished.files??[]){
    try{
     const file=await realpath(candidate);
     const rel=relative(canonicalProject,file);
     if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)||extname(file).toLowerCase()!=='.png')continue;
     files.push({path:rel,file});
    }catch{/* no image available */}
   }
   const content=[{type:'text',text:JSON.stringify({status:'previewed',...(isRange?{start:job.start,end:job.end,count:job.count}:{at:job.at}),files:files.map(f=>f.path).slice(0,2),notes:(finished.lines??[]).slice(0,8).map(line=>String(line).slice(0,180))})}];
   if(files.length){
    const size=(await stat(files[0].file)).size;
    if(size>0&&size<=1500000)content.push({type:'image',data:(await readFile(files[0].file)).toString('base64'),mimeType:'image/png'});
   }
   return {content};
  }finally{
   if(staging)await rm(staging,{recursive:true,force:true});
  }
 });
}

async function timelineMotionPreset(args){
 if(typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision))throw Error('Invalid film revision');
 const {rev,value}=await readProjectFilm(project);
 if(!value||rev!==args.revision)throw Error('Stale or invalid film revision');
 const {ops,applied,seconds}=await motionPresetOps(value,args);
 const receipt=await guardedTimelineOps(rev,ops,{operation:'timeline_apply_motion_preset',clip:args.clip,slot:args.slot,preset_id:applied,seconds});
 return receipt;
}
const TIMELINE_EXTENSIONS=new Set(['.mp4','.mov','.webm','.mkv','.avi','.m4v','.wav','.mp3','.m4a','.flac','.ogg','.png','.jpg','.jpeg','.webp','.gif','.html']);
async function timelineClipSource(path){
 return timelineSource(project,path,raw=>safePath(raw,TIMELINE_EXTENSIONS));
}

async function timelineAdvanced(name,args){
 if(typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision))throw Error('Invalid timeline revision');
 let ops;
 if(name==='timeline_set_properties'){
  ops=[{op:'props',edits:propertyEdits(args.edits)}];
 }else{
  ops=await batchOps(args.steps,async path=>{
   const src=await timelineClipSource(path);
   if(!clipKind(src))throw Error('Unsupported clip kind');
   return src;
  });
 }
 return guardedTimelineOps(args.revision,ops,{operation:name,operations:ops.length});
}

async function timelineGetMotion(args){
 if(typeof args?.clip!=='string'||!args.clip.trim())throw Error('Invalid clip id');
 const {rev,value}=await readProjectFilm(project);
 if(!value)throw Error('Invalid film.html');
 const clip=value.tracks.flatMap(t=>t.clips??[]).find(c=>c.id===args.clip);
 if(!clip)throw Error('Clip not found');
 return {content:[{type:'text',text:JSON.stringify({revision:rev,clip:clip.id,motion:readMotion(clip,value.keyframes)})}]};
}
async function timelineGetClip(args){
 if(typeof args?.clip!=='string'||!args.clip.trim())throw Error('Invalid clip id');
 const {rev,value,problems}=await readProjectFilm(project);
 if(!value)throw Error('Invalid film.html: '+problems.join('; ').slice(0,300));
 for(const [track,t] of value.tracks.entries()){
  const clip=t.clips?.find(c=>c.id===args.clip);
  if(clip)return {content:[{type:'text',text:JSON.stringify({revision:rev,track,kind:kindOf(clip),clip})}]};
 }
 throw Error('Clip not found');
}
async function timelineAssetEdit(name,args){
 if(typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision))throw Error('Invalid timeline revision');
 if(name==='timeline_remove_clip'){
  if(typeof args.clip!=='string'||!args.clip.trim())throw Error('Invalid clip');
  return guardedTimelineOps(args.revision,[{op:'remove',clip:args.clip}],{operation:name,removed_clip_id:args.clip});
 }
 if(typeof args?.path!=='string'||!args.path.trim()||!Number.isFinite(args.at)||args.at<0)throw Error('Invalid asset insert parameters');
 if(args.track!==undefined&&(!Number.isInteger(args.track)||args.track<0))throw Error('Invalid track index');
 if(args.time!==undefined&&(!Array.isArray(args.time)||args.time.length!==2||!args.time.every(Number.isFinite)||args.time[0]<0||args.time[1]<=args.time[0]))throw Error('Invalid asset time interval');
 const src=await timelineClipSource(args.path);
 if(!clipKind(src))throw Error('Unsupported clip kind');
 const doc=await readProjectFilm(project);
 if(!doc.value)throw Error('Invalid film.html');
 if(doc.rev!==args.revision)throw Error('Stale timeline revision; inspect again');
 if(args.track!==undefined&&args.track>=doc.value.tracks.length)throw Error('Target track does not exist. Omit track to let Studio create a track automatically'+(doc.value.tracks.length===0?' in this empty project':'')+'.');
 const clip={src,...(args.time?{time:args.time}:{})};
 const op={op:'insert',clip,at:args.at,...(args.track!==undefined?{track:args.track}:{})};
 return guardedTimelineOps(args.revision,[op],{operation:name,source:src,at:args.at});
}

async function canvasApply(args){
 if(!Array.isArray(args?.ops)||args.ops.length===0||args.ops.length>30||args.ops.some(op=>!op||typeof op!=='object'||Array.isArray(op)))throw Error('Invalid canvas steps');
 const boards=await listBoards(project);
 const board=args?.board??(boards.length===1?'main':null);
 if(!board||!boards.some(item=>item.id===board))throw Error('Specify an existing canvas board before editing');
 const current=await readCanvas(project,board);
 const revision=args?.revision??canvasRevision(current);
 if(typeof revision!=='string'||!/^[a-f0-9]{16}$/.test(revision))throw Error('Invalid canvas revision');
 const payload={folder:project,board,revision,ops:args.ops};
 if(Buffer.byteLength(JSON.stringify(payload))>40000)throw Error('Canvas operation payload exceeds 40 KB');
 const { running }=await import('openfilm/studio-client');
 const studio=await running();
 if(!studio)throw Error('Studio is not running; open the project in Studio before editing its canvas');
 const res=await fetch(studio.origin+'/api/canvas',{
  method:'POST',
  headers:{'content-type':'application/json','x-studio-key':studio.key},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)
 });
 if(!res.ok)throw Error('Studio rejected canvas edit: HTTP '+res.status);
 const answer=await res.json();
 if(!answer?.ok)throw Error('Canvas edit rejected: '+String(answer?.text??answer?.error??'invalid steps'));
 return {content:[{type:'text',text:JSON.stringify({status:'updated',board,revision:answer.revision,added:answer.added??[],nodes:answer.canvas?.nodes?.length??0,edges:answer.canvas?.edges?.length??0})}]};
}

async function canvasTool(name,args){
 if(!(await stat(join(project,'film.html')).catch(()=>null))?.isFile())throw Error('A film.html project is required');
 const boards=await listBoards(project);
 if(name==='canvas_list')return {content:[{type:'text',text:JSON.stringify({boards})}]};
 const board=args?.board??'main';
 if(typeof board!=='string'||!boards.some(b=>b.id===board))throw Error('Canvas board not found');
 const canvas=await readCanvas(project,board);
 if(args?.node!==undefined){
  if(typeof args.node!=='string'||!args.node)throw Error('Invalid node id');
  const node=canvas.nodes.find(n=>n.id===args.node);
  if(!node)throw Error('Canvas node not found');
  return {content:[{type:'text',text:JSON.stringify({board,revision:canvasRevision(canvas),node,edges:canvas.edges.filter(e=>e.from===node.id||e.to===node.id)})}]};
 }
 const limit=args?.limit??20,offset=args?.offset??0;
 if(!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(offset)||offset<0)throw Error('Invalid canvas pagination');
 const all=canvas.nodes;
 const nodes=all.slice(offset,offset+limit).map(n=>({
  id:n.id,kind:n.make??(n.cut?'cut':n.group!==undefined?'group':n.path?'file':'note'),
  ...(n.title?{title:n.title}:{}),...(n.text?{text:n.text.slice(0,140)}:{}),
  ...(n.path?{path:n.path}:{}),...(n.parent?{parent:n.parent}:{})
 }));
 return {content:[{type:'text',text:JSON.stringify({board,revision:canvasRevision(canvas),total:all.length,edge_count:canvas.edges.length,offset,returned:nodes.length,next_offset:offset+limit<all.length?offset+limit:null,nodes})}]};
}
async function timelineEdit(name,args){
 if(name==='timeline_split_clip'){
  const validRange=t=>Array.isArray(t)&&t.length===2&&t.every(v=>Number.isFinite(v)&&v>=0)&&t[1]>t[0];
  const explicit=args?.left_time!==undefined||args?.right_time!==undefined;
  if(typeof args?.clip!=='string'||!args.clip.trim()||typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision)||!Number.isFinite(args.at)||args.at<=0)throw Error('Invalid split parameters');
  if(explicit&&(!validRange(args.left_time)||!validRange(args.right_time)||Math.abs(args.left_time[1]-args.right_time[0])>0.002))throw Error('Invalid or discontinuous source intervals');
  return guardedTimelineOps(args.revision,[{op:'split',clip:args.clip,at:args.at,...(explicit?{time:args.left_time,restTime:args.right_time}:{})}],{clip:args.clip,at:args.at,operation:name});
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
   const sourceCut=Math.round((clip.time[0]+(op.at-beginning)*speed)*1000)/1000;
   if(!Number.isFinite(sourceCut)||sourceCut<=clip.time[0]+0.001||sourceCut>=clip.time[1]-0.001)throw Error('Split point must be strictly inside the clip');
   if(!op.time&&!op.restTime){
    op.time=[clip.time[0],sourceCut];
    op.restTime=[sourceCut,clip.time[1]];
   }
   if(!Array.isArray(op.time)||!Array.isArray(op.restTime)||Math.abs(clip.time[0]-op.time[0])>0.002||Math.abs(clip.time[1]-op.restTime[1])>0.002||Math.abs(op.time[1]-sourceCut)>0.002||Math.abs(op.restTime[0]-sourceCut)>0.002)throw Error('Split must match clip source trim, speed and timeline time');
  }
  const clipTrack=new Map(value.tracks.flatMap((track,index)=>(track.clips??[]).map(clip=>[clip.id,index])));
  const newlyLocked=new Set(ops.filter(op=>op.op==='track'&&op.field==='locked'&&op.value===true).map(op=>op.track));
  const initialIds=new Set(clipTrack.keys());
  const insertedIds=new Set();
  for(const op of ops){
   const touched=op.op==='props'?op.edits.map(edit=>edit.clip):['set','move','remove','split'].includes(op.op)?[op.clip]:[];
   for(const clipId of touched){
    const index=clipTrack.get(clipId);
    if(index===undefined && !insertedIds.has(clipId))throw Error('Clip not found: '+clipId);
    if(index!==undefined && (value.tracks[index].locked||newlyLocked.has(index)))throw Error('Track is locked: '+index);
   }
   if(op.op==='insert'){
    if(op.from!==undefined&&!initialIds.has(op.from))throw Error('Source clip not found');
    if(op.track===undefined&&value.tracks.some(track=>track.locked))throw Error('Specify an unlocked destination track when the project has locked tracks');
    if(op.track!==undefined&&(!value.tracks[op.track]||value.tracks[op.track].locked||newlyLocked.has(op.track)))throw Error('Target track missing or locked. Omit track to let Studio select or create an appropriate unlocked track.');
    const newId=op.clip?.id;
    if(newId!==undefined){
     if(initialIds.has(newId)||insertedIds.has(newId))throw Error('New clip ID already in use');
     insertedIds.add(newId);
    }
   }
   if(op.op==='move'&&op.track!==undefined&&(!value.tracks[op.track]||value.tracks[op.track].locked||newlyLocked.has(op.track)))throw Error('Target track missing or locked');
   if(op.op==='track'){
    const track=value.tracks[op.track];
    if(!track)throw Error('Track not found');
    if(track.locked && !(op.field==='locked'&&op.value===false))throw Error('Track is locked: '+op.track);
   }
  }
  const edited=applyOps(value,ops);
  const checked=readFilm(edited);
  if(!checked.doc)throw Error(checked.problems.join('; '));
  return {value:edited};
 },{ops});
 const beforeIds=new Set((result.current.value?.tracks??[]).flatMap(t=>t.clips??[]).map(c=>c.id));
 const created=result.value.tracks.flatMap(t=>t.clips??[]).find(c=>!beforeIds.has(c.id));
 const details=ops[0]?.op==='insert'?{new_clip_id:created?.id??null}:ops[0]?.op==='split'?{right_clip_id:created?.id??null,left_time:ops[0].time,right_time:ops[0].restTime}:{};
 const newClipIds=result.value.tracks.flatMap(t=>t.clips??[]).filter(c=>!beforeIds.has(c.id)).map(c=>c.id).slice(0,25);
 return {content:[{type:'text',text:JSON.stringify({status:'updated',revision:result.rev,...summary,...details,...(summary.operation==='timeline_apply_batch'?{new_clip_ids:newClipIds}:{})})}]};
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
// Opt-in performance diagnostics. Never print arguments, file paths, credentials or returned content.
function measure(method,name,started,response){
 if(process.env.VIDEOMAKER_MCP_METRICS!=='1')return;
 const elapsedMs=Math.round(Number(process.hrtime.bigint()-started)/1e6*10)/10;
 const outputBytes=Buffer.byteLength(JSON.stringify(response??{}));
 process.stderr.write('MCP_METRIC '+JSON.stringify({
  method,tool:method==='tools/call'?(tools.some(t=>t.name===name)?name:'unknown'):null,
  ok:!response?.isError,elapsed_ms:elapsedMs,response_bytes:outputBytes
 })+'\n');
}
const rl=createInterface({input:process.stdin,crlfDelay:Infinity});
rl.on('line',async line=>{
 let msg;try{msg=JSON.parse(line)}catch{return}
 if(msg.id===undefined)return;
 const started=process.hrtime.bigint();
 try{
  let result;
  switch(msg.method){
   case 'initialize':result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'videomaker-media',version:'1.0.0'}};break;
   case 'ping':result={};break;
   case 'tools/list':result={tools};break;
   case 'tools/call':result=msg.params?.name==='project_page_update'?{content:[{type:'text',text:JSON.stringify(await projectPage(project,msg.params?.arguments))}]}:msg.params?.name==='film_audit'?{content:[{type:'text',text:JSON.stringify(await (async()=>{
  const film=await readProjectFilm(project);
  if(!film.value)throw Error('Invalid film.html');
  return auditFilm(project,film.value,film.rev,msg.params?.arguments?.expected_seconds);
 })())}]}:msg.params?.name==='canvas_manage_board'?{content:[{type:'text',text:JSON.stringify(await manageBoard(project,msg.params?.arguments))}]}:
['captions_transcribe','captions_translate','caption_tracks','caption_track_cues'].includes(msg.params?.name)?
 {content:[{type:'text',text:JSON.stringify(
  ['captions_transcribe','captions_translate'].includes(msg.params.name)||
  (msg.params.name==='caption_tracks'&&msg.params.arguments?.action==='translate')?
  await heavyJob(()=>captionActions(project,msg.params.name,msg.params?.arguments)):
  await captionActions(project,msg.params.name,msg.params?.arguments)
 )}]}:['text3d_font_add','text3d_register','text3d_apply'].includes(msg.params?.name)?await runText3D(msg.params.name,msg.params?.arguments):msg.params?.name==='motion_presets'?{content:[{type:'text',text:JSON.stringify(await motionPresetList(msg.params?.arguments))}]}:msg.params?.name==='timeline_apply_motion_preset'?await timelineMotionPreset(msg.params?.arguments):['captions_list','captions_style','captions_correct_line'].includes(msg.params?.name)?{content:[{type:'text',text:JSON.stringify(await captionTool(project,msg.params.name,msg.params?.arguments))}]}:msg.params?.name==='timeline_get_motion'?await timelineGetMotion(msg.params?.arguments):['timeline_set_properties','timeline_apply_batch'].includes(msg.params?.name)?await timelineAdvanced(msg.params.name,msg.params?.arguments):['film_preview_frame','film_preview_range','film_render'].includes(msg.params?.name)?await filmTool(msg.params.name,msg.params?.arguments):msg.params?.name==='library_take'?await libraryTake(msg.params?.arguments):['text3d_list','text3d_inspect','text3d_validate','text3d_create','text3d_preview'].includes(msg.params?.name)?await text3dTool(msg.params.name,msg.params?.arguments):msg.params?.name==='timeline_get_clip'?await timelineGetClip(msg.params?.arguments):['timeline_insert_asset','timeline_remove_clip'].includes(msg.params?.name)?await timelineAssetEdit(msg.params.name,msg.params?.arguments):msg.params?.name==='library_search'?await libraryTool(msg.params?.arguments):msg.params?.name==='canvas_apply'?await canvasApply(msg.params?.arguments):['canvas_list','canvas_nodes'].includes(msg.params?.name)?await canvasTool(msg.params.name,msg.params?.arguments):['timeline_move_clip','timeline_duplicate_clip','timeline_set_playback','timeline_split_clip'].includes(msg.params?.name)?await timelineEdit(msg.params.name,msg.params?.arguments):['timeline_overview','timeline_clips'].includes(msg.params?.name)?await timelineTool(msg.params.name,msg.params?.arguments):msg.params?.name==='reverse_video'?await reverseVideo(msg.params?.arguments):['music_analyze','music_decode','music_overview','music_context','music_cues','music_validate','music_compare','music_inspect'].includes(msg.params?.name)?await musicTool(msg.params.name,msg.params?.arguments):msg.params?.name==='inspect_video'?await heavyJob(()=>inspect(msg.params.name,msg.params?.arguments)):await inspect(msg.params?.name,msg.params?.arguments);break;
   default:send({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Method not found'}});return;
  }
  send({jsonrpc:'2.0',id:msg.id,result});
  measure(msg.method,msg.params?.name,started,result);
 }catch(e){
  const failure={isError:true,content:[{type:'text',text:String(e.message||e)}]};
  send({jsonrpc:'2.0',id:msg.id,result:failure});
  measure(msg.method,msg.params?.name,started,failure);
 }
});
},revision:{type:'string',pattern:'^[a-f0-9]{16},items:{type:'object',properties:{find:{type:'string'},replace:{type:'string'}},required:['find','replace'],additionalProperties:false}}},required:['action','path'],oneOf:[{properties:{action:{const:'inspect'}}},{properties:{action:{const:'replace'}},required:['expected_sha256','revision','changes']}],additionalProperties:false}},
 {name:'film_audit',description:'Read-only film integrity check: verified explicit durations, unknown durations, missing sources, and optional expected duration. Never guesses media length.',inputSchema:{type:'object',properties:{expected_seconds:{type:'number',minimum:0,maximum:86400}},additionalProperties:false}},
 {name:'film_preview_range',description:'Native deterministic contact-sheet inspection across a bounded timeline range. Returns verified PNG and warnings; render requires browser/FFmpeg.',inputSchema:{type:'object',properties:{start:{type:'number',minimum:0},end:{type:'number',exclusiveMinimum:0},count:{type:'integer',minimum:2,maximum:12}},required:['start','end'],additionalProperties:false}},
 {name:'film_preview_frame',description:'Render one frame of the current film using native look; returns concise checks and one PNG when small enough. Requires an openable browser/FFmpeg.',inputSchema:{type:'object',properties:{at:{type:'number',minimum:0}},required:['at'],additionalProperties:false}},
 {name:'film_render',description:'Render the project with native renderer into a NEW file in assets. Requires revision; atomic exclusive publication. Heavy operation.',inputSchema:{type:'object',properties:{revision:{type:'string'},output:{type:'string'},start:{type:'number',minimum:0},end:{type:'number',exclusiveMinimum:0},fps:{type:'number',minimum:1,maximum:60}},required:['revision','output'],additionalProperties:false}},
 {name:'timeline_overview',description:'Read-only overview of the current project film, its revision, stage and number of tracks/clips.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'timeline_split_clip',description:'Split one clip using explicit source-time intervals and timeline second, as required by Studio. Current revision required. Source timings must be provided accurately.',inputSchema:{type:'object',properties:{clip:{type:'string'},revision:{type:'string'},at:{type:'number',exclusiveMinimum:0},left_time:{type:'array',items:{type:'number'},minItems:2,maxItems:2},right_time:{type:'array',items:{type:'number'},minItems:2,maxItems:2}},required:['clip','revision','at'],additionalProperties:false}},
 {name:'timeline_set_playback',description:'Set clip playback speed (0.1..100) or volume (0..4) using Studio. Requires current revision.',inputSchema:{type:'object',properties:{clip:{type:'string'},revision:{type:'string'},field:{type:'string',enum:['speed','volume']},value:{type:'number'}},required:['clip','revision','field','value'],oneOf:[{properties:{field:{const:'speed'},value:{type:'number',minimum:0.1,maximum:100}}},{properties:{field:{const:'volume'},value:{type:'number',minimum:0,maximum:4}}}],additionalProperties:false}},
 {name:'timeline_duplicate_clip',description:'Duplicate an existing clip at a nonnegative timeline second using Studio, requiring an exact current revision.',inputSchema:{type:'object',properties:{clip:{type:'string'},at:{type:'number',minimum:0},revision:{type:'string'}},required:['clip','at','revision'],additionalProperties:false}},
 {name:'timeline_move_clip',description:'Move one clip to a nonnegative timeline second using the Studio edit engine. Requires current revision returned by timeline_overview; stale revisions are refused.',inputSchema:{type:'object',properties:{clip:{type:'string'},at:{type:'number',minimum:0},revision:{type:'string'}},required:['clip','at','revision'],additionalProperties:false}},
 {name:'timeline_clips',description:'Read-only bounded list of clips from the current film, with IDs, source, kind and timeline/source timing.',inputSchema:{type:'object',properties:{track:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100},offset:{type:'integer',minimum:0}},additionalProperties:false}},
 {name:'text3d_list',description:'List registered reusable 3D text components, with compact metadata and optional source filter.',inputSchema:{type:'object',properties:{source_id:{type:'string'},limit:{type:'integer',minimum:1,maximum:50},offset:{type:'integer',minimum:0}},additionalProperties:false}},
 {name:'text3d_inspect',description:'Read registered Text3D component metadata and editable parameters without reading its bundled source files.',inputSchema:{type:'object',properties:{component_id:{type:'string'}},required:['component_id'],additionalProperties:false}},
 {name:'text3d_create',description:'Create a scoped Text3D draft under .film/text3d-drafts with the existing authoring engine.',inputSchema:{type:'object',properties:{name:{type:'string',maxLength:50}},required:['name'],additionalProperties:false}},
 {name:'text3d_preview',description:'Bundle and verify a Text3D draft using the native Three.js pipeline. To regenerate after edits, set replace_preview=true.',inputSchema:{type:'object',properties:{folder:{type:'string'},replace_preview:{type:'boolean'}},required:['folder'],additionalProperties:false}},
 {name:'text3d_font_add',description:'Add one installed upright TrueType font to a scoped Text3D draft; re-preview after changing the draft.',inputSchema:{type:'object',properties:{folder:{type:'string'},family:{type:'string'},weight:{type:'integer',minimum:1,maximum:1000}},required:['folder','family'],additionalProperties:false}},
 {name:'text3d_register',description:'Publish an unchanged preview-verified Text3D draft to Saved. Requires explicit visual approval. Never call automatically after preview.',inputSchema:{type:'object',properties:{folder:{type:'string'},visual_approved:{type:'boolean'}},required:['folder','visual_approved'],additionalProperties:false}},
 {name:'text3d_apply',description:'Apply an already registered Text3D component to a specific unlocked clip with exact film revision; verifies imported bundle.',inputSchema:{type:'object',properties:{revision:{type:'string'},clip:{type:'string'},component_id:{type:'string'}},required:['revision','clip','component_id'],additionalProperties:false}},
 {name:'text3d_validate',description:'Structurally validate a draft in this project .film/text3d-drafts directory without registering or modifying clips.',inputSchema:{type:'object',properties:{folder:{type:'string'}},required:['folder'],additionalProperties:false}},
 {name:'music_inspect',description:'Inspect available audio streams from local WAV/MP3/MP4 without full acoustic analysis.',inputSchema:{type:'object',properties:{...schema.properties,audio_stream:{type:'integer',minimum:0,maximum:64}},required:['path'],additionalProperties:false}},
 {name:'music_validate',description:'Validate acoustic analysis JSON timestamps and structure; reports valid or invalid, does not modify file.',inputSchema:schema},
 {name:'music_compare',description:'Compact comparison of two time windows in an existing acoustic analysis.',inputSchema:{type:'object',properties:{path:schema.properties.path,start_a:{type:'number',minimum:0},end_a:{type:'number',exclusiveMinimum:0},start_b:{type:'number',minimum:0},end_b:{type:'number',exclusiveMinimum:0}},required:['path','start_a','end_a','start_b','end_b'],additionalProperties:false}},
 {name:'music_analyze',description:'Offline acoustic analysis to new JSON; optionally select audio stream, reuse local cache or enable experimental structural matching.',inputSchema:{type:'object',properties:{path:schema.properties.path,output:{type:'string',description:'New JSON in project/assets'},audio_stream:{type:'integer',minimum:0,maximum:64},use_cache:{type:'boolean'},experimental_structure_v3:{type:'boolean'}},required:['path','output'],additionalProperties:false}},
 {name:'music_decode',description:'Decode a local audio source to new mono f32le PCM + metadata JSON in assets. Returns paths and sizes only; never includes PCM bytes.',inputSchema:{type:'object',properties:{path:schema.properties.path,pcm_output:{type:'string'},metadata_output:{type:'string'},audio_stream:{type:'integer',minimum:0,maximum:64},sample_rate:{type:'integer',minimum:8000,maximum:48000}},required:['path','pcm_output','metadata_output'],additionalProperties:false}},
 {name:'music_overview',description:'Get compact BPM, dynamics and structure overview from an existing analysis JSON.',inputSchema:schema},
 {name:'music_context',description:'Get acoustic context of a time interval from an existing analysis JSON.',inputSchema:{type:'object',properties:{...schema.properties,start:{type:'number',minimum:0},end:{type:'number',exclusiveMinimum:0}},required:['path','start','end']}},
 {name:'music_cues',description:'Select and merge bounded acoustic editing cues by category, strength, and representative/chronological order.',inputSchema:{type:'object',properties:{...schema.properties,start:{type:'number',minimum:0},end:{type:'number',exclusiveMinimum:0},limit:{type:'integer',minimum:1,maximum:100},categories:{type:'array',items:{type:'string',enum:['beat','onset','strong_onset','energy','harmonic_change','structure_boundary']},minItems:1,maxItems:6},selection:{type:'string',enum:['representative','chronological']},min_relative_strength:{type:'number',minimum:0,maximum:1},merge_coincident:{type:'boolean'},merge_window_ms:{type:'number',minimum:0,maximum:250}},required:['path','start','end'],additionalProperties:false}},
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
  try{const killed=spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:10000});if(killed.status===0)return}catch{/* process already ended */}
  try{child.kill('SIGKILL')}catch{/* process already ended */}
  return;
 }
 if(child.pid){try{process.kill(-child.pid,'SIGKILL');return}catch{/* group already ended */}}
 try{child.kill('SIGKILL')}catch{/* child already ended */}
}
function exec(name,args,timeout=30000,env=process.env,acceptedCodes=[0],cwd=undefined){
 return new Promise((resolve,reject)=>{
  const child=spawn(name,args,{stdio:['ignore','pipe','pipe'],env,cwd,detached:process.platform!=='win32'});
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
   if(!acceptedCodes.includes(code))return reject(Error(Buffer.concat(err).toString().slice(0,600)||name+' failed'));
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
  if((await stat(path)).size>15_000_000)throw Error('Image exceeds 15 MB');
  const data=await readFile(path);
  if(data.length>15_000_000)throw Error('Image exceeds 15 MB');
  return {content:[image(data,extname(path).toLowerCase()==='.png'?'image/png':extname(path).toLowerCase()==='.webp'?'image/webp':'image/jpeg')]};
 }
 if(name!=='inspect_video')throw Error('Unknown tool');
 const probe=JSON.parse((await exec('ffprobe',['-v','error','-show_entries','format=duration','-of','json',path])).toString());
 const duration=Number(probe.format?.duration);
 const start=args?.start??0,end=args?.end??duration,n=args?.max_frames??12;
 const offset=args?.frame_offset??0,limit=args?.frame_limit??n;
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>duration+.01||end<=start||!Number.isInteger(n)||n<1||n>24||!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>24)throw Error('Invalid interval or frame count');
 const folder=await mkdtemp(join(tmpdir(),'videomaker-media-mcp-'));
 try{
  const content=[];
  for(let i=offset;i<Math.min(n,offset+limit);i++){
   const time=start+(Math.min(end,duration)-start)*(i+.5)/n;
   const dest=join(folder,`frame-${i}.jpg`);
   await exec('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-ss',time.toFixed(5),'-i',path,'-frames:v','1','-vf','scale=960:-2:force_original_aspect_ratio=decrease','-q:v','4',dest],15000);
   content.push({type:'text',text:`Frame ${i+1}/${n} at ${time.toFixed(3)} seconds`});
   content.push(image(await readFile(dest),'image/jpeg'));
  }
  const returned=Math.max(0,Math.min(n,offset+limit)-offset);
  content.push({type:'text',text:JSON.stringify({total_frames:n,frame_offset:offset,returned_frames:returned,remaining_frames:Math.max(0,n-offset-returned),next_frame_offset:offset+returned<n?offset+returned:null})});
  return {content};
 }finally{await rm(folder,{recursive:true,force:true})}
}

async function safeOutput(raw,extension='.mp4'){
 if(typeof raw!=='string'||!raw.trim())throw Error('Missing output path');
 const base=await realpath(join(project,'assets'));
 const lexical=resolve(project,raw);
 if(extname(lexical).toLowerCase()!==extension)throw Error('Output must be '+extension);
 const parent=await realpath(dirname(lexical));
 const rel=relative(base,parent);
 if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('Output must be inside project/assets');
 const dest=join(parent,basename(lexical));
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
 const archiveScript=resolve(dirname(modulePath),'../manual/media/scripts/reverse-video.py');
 const unpackedScript=archiveScript.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
 const script=unpackedScript!==archiveScript && existsSync(unpackedScript)?unpackedScript:archiveScript;
 const cli=[script,input,output,'--audio',audio];
 if(args?.start!==undefined)cli.push('--start',String(args.start));
 if(args?.end!==undefined)cli.push('--end',String(args.end));
 await heavyJob(()=>exec(pythonBinary(),cli,600000));
 return {content:[{type:'text',text:JSON.stringify({status:'created',path:relative(project,output),audio})}]};
}


const musicSources=new Set(['.wav','.mp3','.mp4']);
const analysisFiles=new Set(['.json']);
function musicRuntime(){
 const bundled=process.resourcesPath && join(process.resourcesPath,'music-analyzer','src');
 const development=resolve(dirname(require.resolve('openfilm/skills')),'../../music-analyzer/src');
 const src=process.env.VIDEOMAKER_MUSIC_ANALYZER_SRC || (bundled && existsSync(bundled)?bundled:development);
 const existing=process.env.PYTHONPATH;
 return { ...process.env, PYTHONPATH:existing?[src,existing].join(process.platform==='win32'?';':':'):src };
}
function intervalArgs(args){
 if(!Number.isFinite(args?.start)||!Number.isFinite(args?.end)||args.start<0||args.end<=args.start)throw Error('Invalid interval');
 return ['--start',String(args.start),'--end',String(args.end)];
}
async function musicTool(name,args){
 let cli;
 if(name==='music_inspect'){
  const input=await safePath(args?.path,musicSources);
  const bytes=await exec(pythonBinary(),['-m','music_analyzer.cli','inspect',input,...musicAudioStream(args)],60000,musicRuntime());
  let result;try{result=JSON.parse(bytes.toString('utf8'))}catch{throw Error('Music inspect returned invalid JSON')}
  return {content:[{type:'text',text:JSON.stringify(result).slice(0,8500)}]};
 }
 if(name==='music_decode'){
  const input=await safePath(args?.path,musicSources);
  const pcm=await safeOutput(args?.pcm_output,'.f32le');
  const metadata=await safeOutput(args?.metadata_output,'.json');
  if(pcm===metadata)throw Error('PCM and metadata must have separate file paths');
  const options=musicDecodeOptions(args);
  return heavyJob(async()=>{
   const tmp=await mkdtemp(join(dirname(pcm),'.music-mcp-decode-'));
   try{
    const pcmTemp=join(tmp,'decoded.f32le'),metaTemp=join(tmp,'metadata.json');
    const response=await exec(pythonBinary(),['-m','music_analyzer.cli','decode',input,'--pcm-output',pcmTemp,'--metadata-output',metaTemp,...options],600000,musicRuntime());
    let result;
    try{result=JSON.parse(response.toString('utf8'))}catch{throw Error('Music decode returned invalid JSON')}
    if(result.status!=='decoded_only')throw Error('Music decoder returned unexpected status');
    const [pcmStats,metaStats]=await Promise.all([stat(pcmTemp),stat(metaTemp)]);
    if(pcmStats.size<4||pcmStats.size>512*1024*1024||metaStats.size<2||metaStats.size>256*1024)throw Error('Decoded PCM/metadata failed size validation');
    // Both final paths are exclusive. Undo first hardlink if second cannot be published.
    await link(pcmTemp,pcm);
    try{await link(metaTemp,metadata)}catch(e){await rm(pcm,{force:true});throw e}
    return {content:[{type:'text',text:JSON.stringify({status:'decoded',pcm_path:relative(project,pcm),metadata_path:relative(project,metadata),pcm_bytes:pcmStats.size,metadata_bytes:metaStats.size,sample_rate:args?.sample_rate??22050,stream:args?.audio_stream??null,next:'PCM is kept on disk; use music_analyze for acoustic features'})}]};
   }finally{
    await rm(tmp,{recursive:true,force:true});
   }
  });
 }
 if(name==='music_analyze'){
  const input=await safePath(args?.path,musicSources);
  const output=await safeOutput(args?.output,'.json');
  cli=['analyze',input,'--output',output];
  // Only a private cache folder under the project is permitted.
  let cachePath;
  if(args?.use_cache===true){
   const projectRoot=await realpath(project);
   const stateDir=join(projectRoot,'.film');
   await mkdir(stateDir,{recursive:true});
   const canonicalState=await realpath(stateDir);
   if(canonicalState!==stateDir)throw Error('Music cache requires a local project .film directory');
   const cacheDir=join(canonicalState,'music-analyzer-cache');
   await mkdir(cacheDir,{recursive:true});
   cachePath=await realpath(cacheDir);
   const rel=relative(projectRoot,cachePath);
   if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('Analyzer cache must stay in this project');
  }
  cli.push(...musicAnalysisOptions(args,cachePath));
 } else {
  const file=await safePath(args?.path,analysisFiles);
  cli=[name==='music_validate'?'validate':name==='music_compare'?'compare':name==='music_overview'?'overview':name==='music_context'?'context':'cues',file];
  if(name==='music_context'||name==='music_cues')cli.push(...intervalArgs(args));
  if(name==='music_compare'){
   for(const suffix of ['a','b']){
    const start=args?.['start_'+suffix],end=args?.['end_'+suffix];
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw Error('Invalid music comparison interval');
    cli.push('--start-'+suffix,String(start),'--end-'+suffix,String(end));
   }
  }
  if(name==='music_cues'){
   const limit=args?.limit??30;
   if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid cue limit');
   cli.push('--limit',String(limit));
   cli.push(...musicCueOptions(args));
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
    return {content:[{type:'text',text:JSON.stringify({status:output.status??'analyzed',validated:true,output_path:relative(project,destination),warnings:Array.isArray(output.warnings)?output.warnings.slice(0,4):[],next:'Use music_overview or music_context for compact results'})}]};
   }finally{await rm(folder,{recursive:true,force:true})}
  });
 }
 const data=await exec(python,['-m','music_analyzer.cli',...cli],60000,musicRuntime(),name==='music_validate'?[0,2]:[0]);
 let output;
 try{output=JSON.parse(data.toString('utf8'))}catch{throw Error('Music analyzer returned invalid JSON')}
 return {content:[{type:'text',text:JSON.stringify(output)}]};
}


async function libraryTool(args){
 if(!Object.hasOwn(KINDS,args?.kind)||typeof args?.query!=='string'||!args.query.trim()||args.query.length>500)throw Error('Invalid library category or query');
 const limit=args?.limit??6;
 if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('Invalid library result limit');
 if(args?.duration!==undefined&&(!Number.isFinite(args.duration)||args.duration<0||args.duration>3600))throw Error('Invalid requested duration');
 const found=await searchLibrary(args.kind,args.query.trim(),{limit,duration:args.duration});
 const results=found.found.map(({item})=>({
  id:item.id,name:item.name?.en??item.id,kind:item.kind,
  ...(item.durationMs!=null?{duration_seconds:Math.round(item.durationMs/1000*10)/10}:{}),
  ...(item.bpm!=null?{bpm:item.bpm}:{}),
  ...(item.energy!=null?{energy:item.energy}:{}),
  ...(item.loop!=null?{loop:item.loop}:{})
 }));
 return {content:[{type:'text',text:JSON.stringify({kind:args.kind,query:args.query,worded:found.worded,count:results.length,results})}]};
}
async function libraryTake(args){
 if(!Object.hasOwn(KINDS,args?.kind)||typeof args?.id!=='string'||!args.id.trim()||args.id.length>500)throw Error('Invalid library item');
 const verb=Object.keys(LIBRARY_VERBS).find(v=>LIBRARY_VERBS[v].kind===args.kind);
 if(!verb)throw Error('Unsupported library category');
 if(!(await stat(join(project,'film.html')).catch(()=>null))?.isFile())throw Error('A film.html project is required');
 const response=await libraryGet(verb,{take:args.id},project);
 if(response.code!==0)throw Error(response.lines?.join(' ').slice(0,600)||'Library import failed');
 return {content:[{type:'text',text:JSON.stringify({status:'completed',kind:args.kind,id:args.id,details:(response.lines??[]).slice(0,8).map(line=>line.slice(0,500))})}]};
}
async function runText3D(name,args){
 let command,revision=null,folder=null;
 if(name==='text3d_apply'){
  if(typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision)||typeof args?.clip!=='string'||!args.clip.trim()||
     typeof args?.component_id!=='string'||!args.component_id.trim())throw Error('Invalid Text3D apply arguments');
  const film=await readProjectFilm(project);
  if(!film.value||film.rev!==args.revision)throw Error('Stale film revision; inspect again');
  const track=film.value.tracks.find(t=>(t.clips??[]).some(c=>c.id===args.clip));
  if(!track)throw Error('Clip not found');
  if(track.locked)throw Error('Cannot modify a locked track');
  if(!(await listText3D()).some(entry=>entry.componentId===args.component_id))throw Error('Text3D component is not registered');
  command=['apply',project,args.clip,args.component_id];
  revision=args.revision;
 }else{
  folder=await draftPath(project,args?.folder);
  if(name==='text3d_font_add'){
   if(typeof args.family!=='string'||!args.family.trim()||args.family.length>100||
      args.weight!==undefined&&(!Number.isInteger(args.weight)||args.weight<1||args.weight>1000))throw Error('Invalid Text3D font');
   command=['font-add',folder,args.family.trim(),String(args.weight??400)];
  }else{
   if(args?.visual_approved!==true)throw Error('Visual approval is required before publishing Text3D');
   command=['register',folder];
  }
 }
 return heavyJob(async()=>{
  if(name==='text3d_register')await requireVerifiedPreview(folder);
  const job={kind:'text3d-command',root:project,args:command,...(revision?{revision}:{})};
  const worker=fileURLToPath(new URL('./film-mcp-worker.mjs',import.meta.url));
  const bytes=await exec(process.execPath,[worker,JSON.stringify(job)],600000,{...process.env,ELECTRON_RUN_AS_NODE:'1'},[0],project);
  const log=bytes.toString('utf8'),marker='MCP_FILM_RESULT=',pos=log.lastIndexOf(marker);
  if(pos<0)throw Error('Text3D worker returned no completion receipt');
  let result;
  try{result=JSON.parse(log.slice(pos+marker.length).split('\n')[0])}catch{throw Error('Invalid Text3D worker receipt')}
  if(name==='text3d_apply'&&!/^[a-f0-9]{16}$/.test(result.revision??''))throw Error('Text3D apply returned no film revision');
  return {content:[{type:'text',text:JSON.stringify({
   status:name==='text3d_register'?'registered':name==='text3d_apply'?'applied':'font_added',
   ...(result.revision?{revision:result.revision}:{}),
   notes:(result.lines??[]).slice(0,3).map(x=>String(x).slice(0,250)),
   ...(name==='text3d_font_add'?{next:'Run text3d_preview with replace_preview:true before registering'}:{})
  })}]};
 });
}
async function text3dTool(name,args){
 if(name==='text3d_create'){
  if(typeof args?.name!=='string'||!/^[a-z][a-z0-9_-]{0,49}$/.test(args.name))throw Error('Invalid Text3D draft name');
  const parent=join(project,'.film','text3d-drafts');
  await mkdir(parent,{recursive:true});
  const base=await realpath(project),actualParent=await realpath(parent);
  const relParent=relative(base,actualParent);
  if(!relParent||relParent==='..'||relParent.startsWith('..'+sep)||isAbsolute(relParent))throw Error('Text3D draft directory must stay in the project');
  const folder=join(actualParent,args.name);
  if(await stat(folder).catch(()=>null))throw Error('Text3D draft already exists');
  const { text3DCommand }=await import('openfilm/text3d-cli');
  const made=await text3DCommand(['create',folder]);
  if(!made.ok)throw Error((made.lines??[]).join(' ').slice(0,500));
  return {content:[{type:'text',text:JSON.stringify({status:'created',folder:relative(project,folder),next:'Edit draft, then call text3d_validate'})}]};
 }
 if(name==='text3d_preview'){
  const target=await draftPath(project,args?.folder);
  return heavyJob(async()=>{
   const sourceBefore=await draftFingerprint(target);
   if(args?.replace_preview===true){
    const previous=target+'-preview';
    const info=await lstat(previous).catch(error=>{if(error?.code==='ENOENT')return null;throw error});
    if(info){
     if(!info.isDirectory()||info.isSymbolicLink())throw Error('Existing preview is not a regular folder');
     await rm(previous,{recursive:true});
    }
   }else if(args?.replace_preview!==undefined&&args.replace_preview!==false){
    throw Error('replace_preview must be a boolean');
   }
   const job={kind:'text3d-preview',root:project,source:target};
   const worker=fileURLToPath(new URL('./film-mcp-worker.mjs',import.meta.url));
   const bytes=await exec(process.execPath,[worker,JSON.stringify(job)],240000,{...process.env,ELECTRON_RUN_AS_NODE:'1',OPENFILM_NO_BROWSER:'1'},[0],project);
   const log=bytes.toString('utf8'),marker='MCP_FILM_RESULT=',pos=log.lastIndexOf(marker);
   if(pos<0)throw Error('Text3D preview worker returned no receipt');
   let result;try{result=JSON.parse(log.slice(pos+marker.length).split('\n')[0])}catch{throw Error('Invalid Text3D preview receipt')}
   const page=await realpath(result.preview);
   const relativePage=relative(root,page);
   if(relativePage==='..'||relativePage.startsWith('..'+sep)||isAbsolute(relativePage))throw Error('Text3D preview escapes project');
   if(await draftFingerprint(target)!==sourceBefore)throw Error('Text3D source changed during preview; verify again');
   await recordPreview(target);
   return {content:[{type:'text',text:JSON.stringify({status:'preview_bundled',preview_page:relativePage,notes:(result.lines??[]).slice(0,3).map(v=>String(v).slice(0,250)),next:'Inspect rendered frames before registering'})}]};
  });
 }
 if(name==='text3d_validate'){
  if(typeof args?.folder!=='string'||!args.folder.trim())throw Error('Invalid Text3D draft folder');
  const base=await realpath(join(project,'.film','text3d-drafts'));
  const root=await realpath(project),relBase=relative(root,base);
  if(!relBase||relBase==='..'||relBase.startsWith('..'+sep)||isAbsolute(relBase))throw Error('Text3D drafts directory escapes project');
  const target=await realpath(resolve(project,args.folder));
  const rel=relative(base,target);
  if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('Text3D drafts must be inside .film/text3d-drafts');
  if(!(await stat(target)).isDirectory())throw Error('Text3D draft is not a directory');
  const { text3DCommand }=await import('openfilm/text3d-cli');
  const validation=await text3DCommand(['validate',target]);
  if(!validation.ok)throw Error((validation.lines??[]).join(' ').slice(0,700));
  return {content:[{type:'text',text:JSON.stringify({valid:true,folder:relative(project,target),message:(validation.lines??[]).join(' ').slice(0,450)})}]};
 }
 const entries=await listText3D();
 if(name==='text3d_inspect'){
  if(typeof args?.component_id!=='string'||!args.component_id.trim())throw Error('Invalid Text3D component ID');
  const entry=entries.find(e=>e.componentId===args.component_id);
  if(!entry)throw Error('Text3D component not found');
  const params=Object.entries(entry.parameterMap??{});
  return {content:[{type:'text',text:JSON.stringify({component_id:entry.componentId,source_id:entry.source2DId,display_name:entry.displayName,parameter_map:Object.fromEntries(params.slice(0,40)),parameters_truncated:params.length>40,bundle_path:entry.bundlePath,active:entry.active})}]};
 }
 if(args?.source_id!==undefined&&(typeof args.source_id!=='string'||args.source_id.length>150))throw Error('Invalid source filter');
 const limit=args?.limit??12,offset=args?.offset??0;
 if(!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(offset)||offset<0)throw Error('Invalid Text3D pagination');
 const chosen=args?.source_id?entries.filter(e=>e.source2DId===args.source_id):entries;
 const results=chosen.slice(offset,offset+limit).map(e=>({component_id:e.componentId,source_id:e.source2DId,display_name:e.displayName,active:e.active}));
 return {content:[{type:'text',text:JSON.stringify({total:chosen.length,offset,returned:results.length,next_offset:offset+limit<chosen.length?offset+limit:null,components:results})}]};
}

async function filmTool(name,args){
 if(!(await stat(join(project,'film.html')).catch(()=>null))?.isFile())throw Error('A film.html project is required');
 const worker=new URL('./film-mcp-worker.mjs',import.meta.url);
 const isRender=name==='film_render';
 const isRange=name==='film_preview_range';
 let output,revision,job,staging;
 if(isRender){
  if(typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision))throw Error('Invalid film revision');
  if(typeof args?.output!=='string'||!['.mp4','.webm','.mov'].includes(extname(args.output).toLowerCase()))throw Error('Output must be a new MP4, WebM or MOV');
  const hasRange=args.start!==undefined||args.end!==undefined;
  if(hasRange&&(!Number.isFinite(args.start)||!Number.isFinite(args.end)||args.start<0||args.end<=args.start))throw Error('Invalid export interval');
  if(args?.fps!==undefined&&(!Number.isFinite(args.fps)||args.fps<1||args.fps>60))throw Error('Invalid export FPS');
  const current=await readProjectFilm(project);
  if(!current.value||current.rev!==args.revision)throw Error('Stale or invalid film revision; inspect again');
  revision=current.rev;
  output=await safeOutput(args.output,extname(args.output).toLowerCase());
  job={kind:'render',root:project,range:hasRange?[args.start,args.end]:null,fps:args.fps??30};
 }else if(isRange){
  if(!Number.isFinite(args?.start)||!Number.isFinite(args?.end)||args.start<0||args.end<=args.start||
     args.end>86400||!Number.isInteger(args?.count??6)||(args.count??6)<2||(args.count??6)>12)throw Error('Invalid contact sheet range');
  job={kind:'look-range',root:project,start:args.start,end:args.end,count:args.count??6};
 }else{
  if(!Number.isFinite(args?.at)||args.at<0)throw Error('Invalid preview time');
  job={kind:'look',root:project,at:args.at};
 }
 return heavyJob(async()=>{
  try{
   if(isRender){
    // Render into a private sibling; link only after validation so a competing file cannot be replaced.
    staging=await mkdtemp(join(dirname(output),'.film-mcp-render-'));
    job.out=join(staging,'output'+extname(output).toLowerCase());
   }
   const bytes=await exec(process.execPath,[fileURLToPath(worker),JSON.stringify(job)],isRender?3600000:180000,{...process.env,ELECTRON_RUN_AS_NODE:'1',OPENFILM_NO_BROWSER:'1'},[0],project);
   const log=bytes.toString('utf8');
   const marker='MCP_FILM_RESULT=';
   const offset=log.lastIndexOf(marker);
   if(offset<0)throw Error('Film worker returned no completion receipt');
   let finished;
   try{finished=JSON.parse(log.slice(offset+marker.length).split('\n')[0])}catch{throw Error('Film worker receipt was not JSON')}
   if(isRender){
    const size=(await stat(job.out)).size;
    if(size===0)throw Error('Rendered file is empty');
    const current=await readProjectFilm(project);
    if(current.rev!==revision)throw Error('Film changed while rendering; render result not published');
    await link(job.out,output);
    return {content:[{type:'text',text:JSON.stringify({status:'rendered',revision,output:relative(project,output),bytes:size,encoder:finished.encoder,notes:(finished.lines??[]).slice(1,5).map(line=>String(line).slice(0,180))})}]};
   }
   const files=[];
   const canonicalProject=await realpath(project);
   for(const candidate of finished.files??[]){
    try{
     const file=await realpath(candidate);
     const rel=relative(canonicalProject,file);
     if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)||extname(file).toLowerCase()!=='.png')continue;
     files.push({path:rel,file});
    }catch{/* no image available */}
   }
   const content=[{type:'text',text:JSON.stringify({status:'previewed',...(isRange?{start:job.start,end:job.end,count:job.count}:{at:job.at}),files:files.map(f=>f.path).slice(0,2),notes:(finished.lines??[]).slice(0,8).map(line=>String(line).slice(0,180))})}];
   if(files.length){
    const size=(await stat(files[0].file)).size;
    if(size>0&&size<=1500000)content.push({type:'image',data:(await readFile(files[0].file)).toString('base64'),mimeType:'image/png'});
   }
   return {content};
  }finally{
   if(staging)await rm(staging,{recursive:true,force:true});
  }
 });
}

async function timelineMotionPreset(args){
 if(typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision))throw Error('Invalid film revision');
 const {rev,value}=await readProjectFilm(project);
 if(!value||rev!==args.revision)throw Error('Stale or invalid film revision');
 const {ops,applied,seconds}=await motionPresetOps(value,args);
 const receipt=await guardedTimelineOps(rev,ops,{operation:'timeline_apply_motion_preset',clip:args.clip,slot:args.slot,preset_id:applied,seconds});
 return receipt;
}
const TIMELINE_EXTENSIONS=new Set(['.mp4','.mov','.webm','.mkv','.avi','.m4v','.wav','.mp3','.m4a','.flac','.ogg','.png','.jpg','.jpeg','.webp','.gif','.html']);
async function timelineClipSource(path){
 return timelineSource(project,path,raw=>safePath(raw,TIMELINE_EXTENSIONS));
}

async function timelineAdvanced(name,args){
 if(typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision))throw Error('Invalid timeline revision');
 let ops;
 if(name==='timeline_set_properties'){
  ops=[{op:'props',edits:propertyEdits(args.edits)}];
 }else{
  ops=await batchOps(args.steps,async path=>{
   const src=await timelineClipSource(path);
   if(!clipKind(src))throw Error('Unsupported clip kind');
   return src;
  });
 }
 return guardedTimelineOps(args.revision,ops,{operation:name,operations:ops.length});
}

async function timelineGetMotion(args){
 if(typeof args?.clip!=='string'||!args.clip.trim())throw Error('Invalid clip id');
 const {rev,value}=await readProjectFilm(project);
 if(!value)throw Error('Invalid film.html');
 const clip=value.tracks.flatMap(t=>t.clips??[]).find(c=>c.id===args.clip);
 if(!clip)throw Error('Clip not found');
 return {content:[{type:'text',text:JSON.stringify({revision:rev,clip:clip.id,motion:readMotion(clip,value.keyframes)})}]};
}
async function timelineGetClip(args){
 if(typeof args?.clip!=='string'||!args.clip.trim())throw Error('Invalid clip id');
 const {rev,value,problems}=await readProjectFilm(project);
 if(!value)throw Error('Invalid film.html: '+problems.join('; ').slice(0,300));
 for(const [track,t] of value.tracks.entries()){
  const clip=t.clips?.find(c=>c.id===args.clip);
  if(clip)return {content:[{type:'text',text:JSON.stringify({revision:rev,track,kind:kindOf(clip),clip})}]};
 }
 throw Error('Clip not found');
}
async function timelineAssetEdit(name,args){
 if(typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision))throw Error('Invalid timeline revision');
 if(name==='timeline_remove_clip'){
  if(typeof args.clip!=='string'||!args.clip.trim())throw Error('Invalid clip');
  return guardedTimelineOps(args.revision,[{op:'remove',clip:args.clip}],{operation:name,removed_clip_id:args.clip});
 }
 if(typeof args?.path!=='string'||!args.path.trim()||!Number.isFinite(args.at)||args.at<0)throw Error('Invalid asset insert parameters');
 if(args.track!==undefined&&(!Number.isInteger(args.track)||args.track<0))throw Error('Invalid track index');
 if(args.time!==undefined&&(!Array.isArray(args.time)||args.time.length!==2||!args.time.every(Number.isFinite)||args.time[0]<0||args.time[1]<=args.time[0]))throw Error('Invalid asset time interval');
 const src=await timelineClipSource(args.path);
 if(!clipKind(src))throw Error('Unsupported clip kind');
 const doc=await readProjectFilm(project);
 if(!doc.value)throw Error('Invalid film.html');
 if(doc.rev!==args.revision)throw Error('Stale timeline revision; inspect again');
 if(args.track!==undefined&&args.track>=doc.value.tracks.length)throw Error('Target track does not exist. Omit track to let Studio create a track automatically'+(doc.value.tracks.length===0?' in this empty project':'')+'.');
 const clip={src,...(args.time?{time:args.time}:{})};
 const op={op:'insert',clip,at:args.at,...(args.track!==undefined?{track:args.track}:{})};
 return guardedTimelineOps(args.revision,[op],{operation:name,source:src,at:args.at});
}

async function canvasApply(args){
 if(!Array.isArray(args?.ops)||args.ops.length===0||args.ops.length>30||args.ops.some(op=>!op||typeof op!=='object'||Array.isArray(op)))throw Error('Invalid canvas steps');
 const boards=await listBoards(project);
 const board=args?.board??(boards.length===1?'main':null);
 if(!board||!boards.some(item=>item.id===board))throw Error('Specify an existing canvas board before editing');
 const current=await readCanvas(project,board);
 const revision=args?.revision??canvasRevision(current);
 if(typeof revision!=='string'||!/^[a-f0-9]{16}$/.test(revision))throw Error('Invalid canvas revision');
 const payload={folder:project,board,revision,ops:args.ops};
 if(Buffer.byteLength(JSON.stringify(payload))>40000)throw Error('Canvas operation payload exceeds 40 KB');
 const { running }=await import('openfilm/studio-client');
 const studio=await running();
 if(!studio)throw Error('Studio is not running; open the project in Studio before editing its canvas');
 const res=await fetch(studio.origin+'/api/canvas',{
  method:'POST',
  headers:{'content-type':'application/json','x-studio-key':studio.key},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)
 });
 if(!res.ok)throw Error('Studio rejected canvas edit: HTTP '+res.status);
 const answer=await res.json();
 if(!answer?.ok)throw Error('Canvas edit rejected: '+String(answer?.text??answer?.error??'invalid steps'));
 return {content:[{type:'text',text:JSON.stringify({status:'updated',board,revision:answer.revision,added:answer.added??[],nodes:answer.canvas?.nodes?.length??0,edges:answer.canvas?.edges?.length??0})}]};
}

async function canvasTool(name,args){
 if(!(await stat(join(project,'film.html')).catch(()=>null))?.isFile())throw Error('A film.html project is required');
 const boards=await listBoards(project);
 if(name==='canvas_list')return {content:[{type:'text',text:JSON.stringify({boards})}]};
 const board=args?.board??'main';
 if(typeof board!=='string'||!boards.some(b=>b.id===board))throw Error('Canvas board not found');
 const canvas=await readCanvas(project,board);
 if(args?.node!==undefined){
  if(typeof args.node!=='string'||!args.node)throw Error('Invalid node id');
  const node=canvas.nodes.find(n=>n.id===args.node);
  if(!node)throw Error('Canvas node not found');
  return {content:[{type:'text',text:JSON.stringify({board,revision:canvasRevision(canvas),node,edges:canvas.edges.filter(e=>e.from===node.id||e.to===node.id)})}]};
 }
 const limit=args?.limit??20,offset=args?.offset??0;
 if(!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(offset)||offset<0)throw Error('Invalid canvas pagination');
 const all=canvas.nodes;
 const nodes=all.slice(offset,offset+limit).map(n=>({
  id:n.id,kind:n.make??(n.cut?'cut':n.group!==undefined?'group':n.path?'file':'note'),
  ...(n.title?{title:n.title}:{}),...(n.text?{text:n.text.slice(0,140)}:{}),
  ...(n.path?{path:n.path}:{}),...(n.parent?{parent:n.parent}:{})
 }));
 return {content:[{type:'text',text:JSON.stringify({board,revision:canvasRevision(canvas),total:all.length,edge_count:canvas.edges.length,offset,returned:nodes.length,next_offset:offset+limit<all.length?offset+limit:null,nodes})}]};
}
async function timelineEdit(name,args){
 if(name==='timeline_split_clip'){
  const validRange=t=>Array.isArray(t)&&t.length===2&&t.every(v=>Number.isFinite(v)&&v>=0)&&t[1]>t[0];
  const explicit=args?.left_time!==undefined||args?.right_time!==undefined;
  if(typeof args?.clip!=='string'||!args.clip.trim()||typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision)||!Number.isFinite(args.at)||args.at<=0)throw Error('Invalid split parameters');
  if(explicit&&(!validRange(args.left_time)||!validRange(args.right_time)||Math.abs(args.left_time[1]-args.right_time[0])>0.002))throw Error('Invalid or discontinuous source intervals');
  return guardedTimelineOps(args.revision,[{op:'split',clip:args.clip,at:args.at,...(explicit?{time:args.left_time,restTime:args.right_time}:{})}],{clip:args.clip,at:args.at,operation:name});
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
   const sourceCut=Math.round((clip.time[0]+(op.at-beginning)*speed)*1000)/1000;
   if(!Number.isFinite(sourceCut)||sourceCut<=clip.time[0]+0.001||sourceCut>=clip.time[1]-0.001)throw Error('Split point must be strictly inside the clip');
   if(!op.time&&!op.restTime){
    op.time=[clip.time[0],sourceCut];
    op.restTime=[sourceCut,clip.time[1]];
   }
   if(!Array.isArray(op.time)||!Array.isArray(op.restTime)||Math.abs(clip.time[0]-op.time[0])>0.002||Math.abs(clip.time[1]-op.restTime[1])>0.002||Math.abs(op.time[1]-sourceCut)>0.002||Math.abs(op.restTime[0]-sourceCut)>0.002)throw Error('Split must match clip source trim, speed and timeline time');
  }
  const clipTrack=new Map(value.tracks.flatMap((track,index)=>(track.clips??[]).map(clip=>[clip.id,index])));
  const newlyLocked=new Set(ops.filter(op=>op.op==='track'&&op.field==='locked'&&op.value===true).map(op=>op.track));
  const initialIds=new Set(clipTrack.keys());
  const insertedIds=new Set();
  for(const op of ops){
   const touched=op.op==='props'?op.edits.map(edit=>edit.clip):['set','move','remove','split'].includes(op.op)?[op.clip]:[];
   for(const clipId of touched){
    const index=clipTrack.get(clipId);
    if(index===undefined && !insertedIds.has(clipId))throw Error('Clip not found: '+clipId);
    if(index!==undefined && (value.tracks[index].locked||newlyLocked.has(index)))throw Error('Track is locked: '+index);
   }
   if(op.op==='insert'){
    if(op.from!==undefined&&!initialIds.has(op.from))throw Error('Source clip not found');
    if(op.track===undefined&&value.tracks.some(track=>track.locked))throw Error('Specify an unlocked destination track when the project has locked tracks');
    if(op.track!==undefined&&(!value.tracks[op.track]||value.tracks[op.track].locked||newlyLocked.has(op.track)))throw Error('Target track missing or locked. Omit track to let Studio select or create an appropriate unlocked track.');
    const newId=op.clip?.id;
    if(newId!==undefined){
     if(initialIds.has(newId)||insertedIds.has(newId))throw Error('New clip ID already in use');
     insertedIds.add(newId);
    }
   }
   if(op.op==='move'&&op.track!==undefined&&(!value.tracks[op.track]||value.tracks[op.track].locked||newlyLocked.has(op.track)))throw Error('Target track missing or locked');
   if(op.op==='track'){
    const track=value.tracks[op.track];
    if(!track)throw Error('Track not found');
    if(track.locked && !(op.field==='locked'&&op.value===false))throw Error('Track is locked: '+op.track);
   }
  }
  const edited=applyOps(value,ops);
  const checked=readFilm(edited);
  if(!checked.doc)throw Error(checked.problems.join('; '));
  return {value:edited};
 },{ops});
 const beforeIds=new Set((result.current.value?.tracks??[]).flatMap(t=>t.clips??[]).map(c=>c.id));
 const created=result.value.tracks.flatMap(t=>t.clips??[]).find(c=>!beforeIds.has(c.id));
 const details=ops[0]?.op==='insert'?{new_clip_id:created?.id??null}:ops[0]?.op==='split'?{right_clip_id:created?.id??null,left_time:ops[0].time,right_time:ops[0].restTime}:{};
 const newClipIds=result.value.tracks.flatMap(t=>t.clips??[]).filter(c=>!beforeIds.has(c.id)).map(c=>c.id).slice(0,25);
 return {content:[{type:'text',text:JSON.stringify({status:'updated',revision:result.rev,...summary,...details,...(summary.operation==='timeline_apply_batch'?{new_clip_ids:newClipIds}:{})})}]};
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
// Opt-in performance diagnostics. Never print arguments, file paths, credentials or returned content.
function measure(method,name,started,response){
 if(process.env.VIDEOMAKER_MCP_METRICS!=='1')return;
 const elapsedMs=Math.round(Number(process.hrtime.bigint()-started)/1e6*10)/10;
 const outputBytes=Buffer.byteLength(JSON.stringify(response??{}));
 process.stderr.write('MCP_METRIC '+JSON.stringify({
  method,tool:method==='tools/call'?(tools.some(t=>t.name===name)?name:'unknown'):null,
  ok:!response?.isError,elapsed_ms:elapsedMs,response_bytes:outputBytes
 })+'\n');
}
const rl=createInterface({input:process.stdin,crlfDelay:Infinity});
rl.on('line',async line=>{
 let msg;try{msg=JSON.parse(line)}catch{return}
 if(msg.id===undefined)return;
 const started=process.hrtime.bigint();
 try{
  let result;
  switch(msg.method){
   case 'initialize':result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'videomaker-media',version:'1.0.0'}};break;
   case 'ping':result={};break;
   case 'tools/list':result={tools};break;
   case 'tools/call':result=msg.params?.name==='project_page_update'?{content:[{type:'text',text:JSON.stringify(await projectPage(project,msg.params?.arguments))}]}:msg.params?.name==='film_audit'?{content:[{type:'text',text:JSON.stringify(await (async()=>{
  const film=await readProjectFilm(project);
  if(!film.value)throw Error('Invalid film.html');
  return auditFilm(project,film.value,film.rev,msg.params?.arguments?.expected_seconds);
 })())}]}:msg.params?.name==='canvas_manage_board'?{content:[{type:'text',text:JSON.stringify(await manageBoard(project,msg.params?.arguments))}]}:
['captions_transcribe','captions_translate','caption_tracks','caption_track_cues'].includes(msg.params?.name)?
 {content:[{type:'text',text:JSON.stringify(
  ['captions_transcribe','captions_translate'].includes(msg.params.name)||
  (msg.params.name==='caption_tracks'&&msg.params.arguments?.action==='translate')?
  await heavyJob(()=>captionActions(project,msg.params.name,msg.params?.arguments)):
  await captionActions(project,msg.params.name,msg.params?.arguments)
 )}]}:['text3d_font_add','text3d_register','text3d_apply'].includes(msg.params?.name)?await runText3D(msg.params.name,msg.params?.arguments):msg.params?.name==='motion_presets'?{content:[{type:'text',text:JSON.stringify(await motionPresetList(msg.params?.arguments))}]}:msg.params?.name==='timeline_apply_motion_preset'?await timelineMotionPreset(msg.params?.arguments):['captions_list','captions_style','captions_correct_line'].includes(msg.params?.name)?{content:[{type:'text',text:JSON.stringify(await captionTool(project,msg.params.name,msg.params?.arguments))}]}:msg.params?.name==='timeline_get_motion'?await timelineGetMotion(msg.params?.arguments):['timeline_set_properties','timeline_apply_batch'].includes(msg.params?.name)?await timelineAdvanced(msg.params.name,msg.params?.arguments):['film_preview_frame','film_preview_range','film_render'].includes(msg.params?.name)?await filmTool(msg.params.name,msg.params?.arguments):msg.params?.name==='library_take'?await libraryTake(msg.params?.arguments):['text3d_list','text3d_inspect','text3d_validate','text3d_create','text3d_preview'].includes(msg.params?.name)?await text3dTool(msg.params.name,msg.params?.arguments):msg.params?.name==='timeline_get_clip'?await timelineGetClip(msg.params?.arguments):['timeline_insert_asset','timeline_remove_clip'].includes(msg.params?.name)?await timelineAssetEdit(msg.params.name,msg.params?.arguments):msg.params?.name==='library_search'?await libraryTool(msg.params?.arguments):msg.params?.name==='canvas_apply'?await canvasApply(msg.params?.arguments):['canvas_list','canvas_nodes'].includes(msg.params?.name)?await canvasTool(msg.params.name,msg.params?.arguments):['timeline_move_clip','timeline_duplicate_clip','timeline_set_playback','timeline_split_clip'].includes(msg.params?.name)?await timelineEdit(msg.params.name,msg.params?.arguments):['timeline_overview','timeline_clips'].includes(msg.params?.name)?await timelineTool(msg.params.name,msg.params?.arguments):msg.params?.name==='reverse_video'?await reverseVideo(msg.params?.arguments):['music_analyze','music_decode','music_overview','music_context','music_cues','music_validate','music_compare','music_inspect'].includes(msg.params?.name)?await musicTool(msg.params.name,msg.params?.arguments):msg.params?.name==='inspect_video'?await heavyJob(()=>inspect(msg.params.name,msg.params?.arguments)):await inspect(msg.params?.name,msg.params?.arguments);break;
   default:send({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Method not found'}});return;
  }
  send({jsonrpc:'2.0',id:msg.id,result});
  measure(msg.method,msg.params?.name,started,result);
 }catch(e){
  const failure={isError:true,content:[{type:'text',text:String(e.message||e)}]};
  send({jsonrpc:'2.0',id:msg.id,result:failure});
  measure(msg.method,msg.params?.name,started,failure);
 }
});
},changes:{type:'array',minItems:1,maxItems:8,items:{type:'object',properties:{find:{type:'string'},replace:{type:'string'}},required:['find','replace'],additionalProperties:false}}},required:['action','path'],oneOf:[{properties:{action:{const:'inspect'}}},{properties:{action:{const:'replace'}},required:['expected_sha256','revision','changes']}],additionalProperties:false}},
 {name:'film_audit',description:'Read-only film integrity check: verified explicit durations, unknown durations, missing sources, and optional expected duration. Never guesses media length.',inputSchema:{type:'object',properties:{expected_seconds:{type:'number',minimum:0,maximum:86400}},additionalProperties:false}},
 {name:'film_preview_range',description:'Native deterministic contact-sheet inspection across a bounded timeline range. Returns verified PNG and warnings; render requires browser/FFmpeg.',inputSchema:{type:'object',properties:{start:{type:'number',minimum:0},end:{type:'number',exclusiveMinimum:0},count:{type:'integer',minimum:2,maximum:12}},required:['start','end'],additionalProperties:false}},
 {name:'film_preview_frame',description:'Render one frame of the current film using native look; returns concise checks and one PNG when small enough. Requires an openable browser/FFmpeg.',inputSchema:{type:'object',properties:{at:{type:'number',minimum:0}},required:['at'],additionalProperties:false}},
 {name:'film_render',description:'Render the project with native renderer into a NEW file in assets. Requires revision; atomic exclusive publication. Heavy operation.',inputSchema:{type:'object',properties:{revision:{type:'string'},output:{type:'string'},start:{type:'number',minimum:0},end:{type:'number',exclusiveMinimum:0},fps:{type:'number',minimum:1,maximum:60}},required:['revision','output'],additionalProperties:false}},
 {name:'timeline_overview',description:'Read-only overview of the current project film, its revision, stage and number of tracks/clips.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'timeline_split_clip',description:'Split one clip using explicit source-time intervals and timeline second, as required by Studio. Current revision required. Source timings must be provided accurately.',inputSchema:{type:'object',properties:{clip:{type:'string'},revision:{type:'string'},at:{type:'number',exclusiveMinimum:0},left_time:{type:'array',items:{type:'number'},minItems:2,maxItems:2},right_time:{type:'array',items:{type:'number'},minItems:2,maxItems:2}},required:['clip','revision','at'],additionalProperties:false}},
 {name:'timeline_set_playback',description:'Set clip playback speed (0.1..100) or volume (0..4) using Studio. Requires current revision.',inputSchema:{type:'object',properties:{clip:{type:'string'},revision:{type:'string'},field:{type:'string',enum:['speed','volume']},value:{type:'number'}},required:['clip','revision','field','value'],oneOf:[{properties:{field:{const:'speed'},value:{type:'number',minimum:0.1,maximum:100}}},{properties:{field:{const:'volume'},value:{type:'number',minimum:0,maximum:4}}}],additionalProperties:false}},
 {name:'timeline_duplicate_clip',description:'Duplicate an existing clip at a nonnegative timeline second using Studio, requiring an exact current revision.',inputSchema:{type:'object',properties:{clip:{type:'string'},at:{type:'number',minimum:0},revision:{type:'string'}},required:['clip','at','revision'],additionalProperties:false}},
 {name:'timeline_move_clip',description:'Move one clip to a nonnegative timeline second using the Studio edit engine. Requires current revision returned by timeline_overview; stale revisions are refused.',inputSchema:{type:'object',properties:{clip:{type:'string'},at:{type:'number',minimum:0},revision:{type:'string'}},required:['clip','at','revision'],additionalProperties:false}},
 {name:'timeline_clips',description:'Read-only bounded list of clips from the current film, with IDs, source, kind and timeline/source timing.',inputSchema:{type:'object',properties:{track:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100},offset:{type:'integer',minimum:0}},additionalProperties:false}},
 {name:'text3d_list',description:'List registered reusable 3D text components, with compact metadata and optional source filter.',inputSchema:{type:'object',properties:{source_id:{type:'string'},limit:{type:'integer',minimum:1,maximum:50},offset:{type:'integer',minimum:0}},additionalProperties:false}},
 {name:'text3d_inspect',description:'Read registered Text3D component metadata and editable parameters without reading its bundled source files.',inputSchema:{type:'object',properties:{component_id:{type:'string'}},required:['component_id'],additionalProperties:false}},
 {name:'text3d_create',description:'Create a scoped Text3D draft under .film/text3d-drafts with the existing authoring engine.',inputSchema:{type:'object',properties:{name:{type:'string',maxLength:50}},required:['name'],additionalProperties:false}},
 {name:'text3d_preview',description:'Bundle and verify a Text3D draft using the native Three.js pipeline. To regenerate after edits, set replace_preview=true.',inputSchema:{type:'object',properties:{folder:{type:'string'},replace_preview:{type:'boolean'}},required:['folder'],additionalProperties:false}},
 {name:'text3d_font_add',description:'Add one installed upright TrueType font to a scoped Text3D draft; re-preview after changing the draft.',inputSchema:{type:'object',properties:{folder:{type:'string'},family:{type:'string'},weight:{type:'integer',minimum:1,maximum:1000}},required:['folder','family'],additionalProperties:false}},
 {name:'text3d_register',description:'Publish an unchanged preview-verified Text3D draft to Saved. Requires explicit visual approval. Never call automatically after preview.',inputSchema:{type:'object',properties:{folder:{type:'string'},visual_approved:{type:'boolean'}},required:['folder','visual_approved'],additionalProperties:false}},
 {name:'text3d_apply',description:'Apply an already registered Text3D component to a specific unlocked clip with exact film revision; verifies imported bundle.',inputSchema:{type:'object',properties:{revision:{type:'string'},clip:{type:'string'},component_id:{type:'string'}},required:['revision','clip','component_id'],additionalProperties:false}},
 {name:'text3d_validate',description:'Structurally validate a draft in this project .film/text3d-drafts directory without registering or modifying clips.',inputSchema:{type:'object',properties:{folder:{type:'string'}},required:['folder'],additionalProperties:false}},
 {name:'music_inspect',description:'Inspect available audio streams from local WAV/MP3/MP4 without full acoustic analysis.',inputSchema:{type:'object',properties:{...schema.properties,audio_stream:{type:'integer',minimum:0,maximum:64}},required:['path'],additionalProperties:false}},
 {name:'music_validate',description:'Validate acoustic analysis JSON timestamps and structure; reports valid or invalid, does not modify file.',inputSchema:schema},
 {name:'music_compare',description:'Compact comparison of two time windows in an existing acoustic analysis.',inputSchema:{type:'object',properties:{path:schema.properties.path,start_a:{type:'number',minimum:0},end_a:{type:'number',exclusiveMinimum:0},start_b:{type:'number',minimum:0},end_b:{type:'number',exclusiveMinimum:0}},required:['path','start_a','end_a','start_b','end_b'],additionalProperties:false}},
 {name:'music_analyze',description:'Offline acoustic analysis to new JSON; optionally select audio stream, reuse local cache or enable experimental structural matching.',inputSchema:{type:'object',properties:{path:schema.properties.path,output:{type:'string',description:'New JSON in project/assets'},audio_stream:{type:'integer',minimum:0,maximum:64},use_cache:{type:'boolean'},experimental_structure_v3:{type:'boolean'}},required:['path','output'],additionalProperties:false}},
 {name:'music_decode',description:'Decode a local audio source to new mono f32le PCM + metadata JSON in assets. Returns paths and sizes only; never includes PCM bytes.',inputSchema:{type:'object',properties:{path:schema.properties.path,pcm_output:{type:'string'},metadata_output:{type:'string'},audio_stream:{type:'integer',minimum:0,maximum:64},sample_rate:{type:'integer',minimum:8000,maximum:48000}},required:['path','pcm_output','metadata_output'],additionalProperties:false}},
 {name:'music_overview',description:'Get compact BPM, dynamics and structure overview from an existing analysis JSON.',inputSchema:schema},
 {name:'music_context',description:'Get acoustic context of a time interval from an existing analysis JSON.',inputSchema:{type:'object',properties:{...schema.properties,start:{type:'number',minimum:0},end:{type:'number',exclusiveMinimum:0}},required:['path','start','end']}},
 {name:'music_cues',description:'Select and merge bounded acoustic editing cues by category, strength, and representative/chronological order.',inputSchema:{type:'object',properties:{...schema.properties,start:{type:'number',minimum:0},end:{type:'number',exclusiveMinimum:0},limit:{type:'integer',minimum:1,maximum:100},categories:{type:'array',items:{type:'string',enum:['beat','onset','strong_onset','energy','harmonic_change','structure_boundary']},minItems:1,maxItems:6},selection:{type:'string',enum:['representative','chronological']},min_relative_strength:{type:'number',minimum:0,maximum:1},merge_coincident:{type:'boolean'},merge_window_ms:{type:'number',minimum:0,maximum:250}},required:['path','start','end'],additionalProperties:false}},
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
  try{const killed=spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:10000});if(killed.status===0)return}catch{/* process already ended */}
  try{child.kill('SIGKILL')}catch{/* process already ended */}
  return;
 }
 if(child.pid){try{process.kill(-child.pid,'SIGKILL');return}catch{/* group already ended */}}
 try{child.kill('SIGKILL')}catch{/* child already ended */}
}
function exec(name,args,timeout=30000,env=process.env,acceptedCodes=[0],cwd=undefined){
 return new Promise((resolve,reject)=>{
  const child=spawn(name,args,{stdio:['ignore','pipe','pipe'],env,cwd,detached:process.platform!=='win32'});
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
   if(!acceptedCodes.includes(code))return reject(Error(Buffer.concat(err).toString().slice(0,600)||name+' failed'));
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
  if((await stat(path)).size>15_000_000)throw Error('Image exceeds 15 MB');
  const data=await readFile(path);
  if(data.length>15_000_000)throw Error('Image exceeds 15 MB');
  return {content:[image(data,extname(path).toLowerCase()==='.png'?'image/png':extname(path).toLowerCase()==='.webp'?'image/webp':'image/jpeg')]};
 }
 if(name!=='inspect_video')throw Error('Unknown tool');
 const probe=JSON.parse((await exec('ffprobe',['-v','error','-show_entries','format=duration','-of','json',path])).toString());
 const duration=Number(probe.format?.duration);
 const start=args?.start??0,end=args?.end??duration,n=args?.max_frames??12;
 const offset=args?.frame_offset??0,limit=args?.frame_limit??n;
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>duration+.01||end<=start||!Number.isInteger(n)||n<1||n>24||!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>24)throw Error('Invalid interval or frame count');
 const folder=await mkdtemp(join(tmpdir(),'videomaker-media-mcp-'));
 try{
  const content=[];
  for(let i=offset;i<Math.min(n,offset+limit);i++){
   const time=start+(Math.min(end,duration)-start)*(i+.5)/n;
   const dest=join(folder,`frame-${i}.jpg`);
   await exec('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-ss',time.toFixed(5),'-i',path,'-frames:v','1','-vf','scale=960:-2:force_original_aspect_ratio=decrease','-q:v','4',dest],15000);
   content.push({type:'text',text:`Frame ${i+1}/${n} at ${time.toFixed(3)} seconds`});
   content.push(image(await readFile(dest),'image/jpeg'));
  }
  const returned=Math.max(0,Math.min(n,offset+limit)-offset);
  content.push({type:'text',text:JSON.stringify({total_frames:n,frame_offset:offset,returned_frames:returned,remaining_frames:Math.max(0,n-offset-returned),next_frame_offset:offset+returned<n?offset+returned:null})});
  return {content};
 }finally{await rm(folder,{recursive:true,force:true})}
}

async function safeOutput(raw,extension='.mp4'){
 if(typeof raw!=='string'||!raw.trim())throw Error('Missing output path');
 const base=await realpath(join(project,'assets'));
 const lexical=resolve(project,raw);
 if(extname(lexical).toLowerCase()!==extension)throw Error('Output must be '+extension);
 const parent=await realpath(dirname(lexical));
 const rel=relative(base,parent);
 if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('Output must be inside project/assets');
 const dest=join(parent,basename(lexical));
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
 const archiveScript=resolve(dirname(modulePath),'../manual/media/scripts/reverse-video.py');
 const unpackedScript=archiveScript.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
 const script=unpackedScript!==archiveScript && existsSync(unpackedScript)?unpackedScript:archiveScript;
 const cli=[script,input,output,'--audio',audio];
 if(args?.start!==undefined)cli.push('--start',String(args.start));
 if(args?.end!==undefined)cli.push('--end',String(args.end));
 await heavyJob(()=>exec(pythonBinary(),cli,600000));
 return {content:[{type:'text',text:JSON.stringify({status:'created',path:relative(project,output),audio})}]};
}


const musicSources=new Set(['.wav','.mp3','.mp4']);
const analysisFiles=new Set(['.json']);
function musicRuntime(){
 const bundled=process.resourcesPath && join(process.resourcesPath,'music-analyzer','src');
 const development=resolve(dirname(require.resolve('openfilm/skills')),'../../music-analyzer/src');
 const src=process.env.VIDEOMAKER_MUSIC_ANALYZER_SRC || (bundled && existsSync(bundled)?bundled:development);
 const existing=process.env.PYTHONPATH;
 return { ...process.env, PYTHONPATH:existing?[src,existing].join(process.platform==='win32'?';':':'):src };
}
function intervalArgs(args){
 if(!Number.isFinite(args?.start)||!Number.isFinite(args?.end)||args.start<0||args.end<=args.start)throw Error('Invalid interval');
 return ['--start',String(args.start),'--end',String(args.end)];
}
async function musicTool(name,args){
 let cli;
 if(name==='music_inspect'){
  const input=await safePath(args?.path,musicSources);
  const bytes=await exec(pythonBinary(),['-m','music_analyzer.cli','inspect',input,...musicAudioStream(args)],60000,musicRuntime());
  let result;try{result=JSON.parse(bytes.toString('utf8'))}catch{throw Error('Music inspect returned invalid JSON')}
  return {content:[{type:'text',text:JSON.stringify(result).slice(0,8500)}]};
 }
 if(name==='music_decode'){
  const input=await safePath(args?.path,musicSources);
  const pcm=await safeOutput(args?.pcm_output,'.f32le');
  const metadata=await safeOutput(args?.metadata_output,'.json');
  if(pcm===metadata)throw Error('PCM and metadata must have separate file paths');
  const options=musicDecodeOptions(args);
  return heavyJob(async()=>{
   const tmp=await mkdtemp(join(dirname(pcm),'.music-mcp-decode-'));
   try{
    const pcmTemp=join(tmp,'decoded.f32le'),metaTemp=join(tmp,'metadata.json');
    const response=await exec(pythonBinary(),['-m','music_analyzer.cli','decode',input,'--pcm-output',pcmTemp,'--metadata-output',metaTemp,...options],600000,musicRuntime());
    let result;
    try{result=JSON.parse(response.toString('utf8'))}catch{throw Error('Music decode returned invalid JSON')}
    if(result.status!=='decoded_only')throw Error('Music decoder returned unexpected status');
    const [pcmStats,metaStats]=await Promise.all([stat(pcmTemp),stat(metaTemp)]);
    if(pcmStats.size<4||pcmStats.size>512*1024*1024||metaStats.size<2||metaStats.size>256*1024)throw Error('Decoded PCM/metadata failed size validation');
    // Both final paths are exclusive. Undo first hardlink if second cannot be published.
    await link(pcmTemp,pcm);
    try{await link(metaTemp,metadata)}catch(e){await rm(pcm,{force:true});throw e}
    return {content:[{type:'text',text:JSON.stringify({status:'decoded',pcm_path:relative(project,pcm),metadata_path:relative(project,metadata),pcm_bytes:pcmStats.size,metadata_bytes:metaStats.size,sample_rate:args?.sample_rate??22050,stream:args?.audio_stream??null,next:'PCM is kept on disk; use music_analyze for acoustic features'})}]};
   }finally{
    await rm(tmp,{recursive:true,force:true});
   }
  });
 }
 if(name==='music_analyze'){
  const input=await safePath(args?.path,musicSources);
  const output=await safeOutput(args?.output,'.json');
  cli=['analyze',input,'--output',output];
  // Only a private cache folder under the project is permitted.
  let cachePath;
  if(args?.use_cache===true){
   const projectRoot=await realpath(project);
   const stateDir=join(projectRoot,'.film');
   await mkdir(stateDir,{recursive:true});
   const canonicalState=await realpath(stateDir);
   if(canonicalState!==stateDir)throw Error('Music cache requires a local project .film directory');
   const cacheDir=join(canonicalState,'music-analyzer-cache');
   await mkdir(cacheDir,{recursive:true});
   cachePath=await realpath(cacheDir);
   const rel=relative(projectRoot,cachePath);
   if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('Analyzer cache must stay in this project');
  }
  cli.push(...musicAnalysisOptions(args,cachePath));
 } else {
  const file=await safePath(args?.path,analysisFiles);
  cli=[name==='music_validate'?'validate':name==='music_compare'?'compare':name==='music_overview'?'overview':name==='music_context'?'context':'cues',file];
  if(name==='music_context'||name==='music_cues')cli.push(...intervalArgs(args));
  if(name==='music_compare'){
   for(const suffix of ['a','b']){
    const start=args?.['start_'+suffix],end=args?.['end_'+suffix];
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw Error('Invalid music comparison interval');
    cli.push('--start-'+suffix,String(start),'--end-'+suffix,String(end));
   }
  }
  if(name==='music_cues'){
   const limit=args?.limit??30;
   if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid cue limit');
   cli.push('--limit',String(limit));
   cli.push(...musicCueOptions(args));
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
    return {content:[{type:'text',text:JSON.stringify({status:output.status??'analyzed',validated:true,output_path:relative(project,destination),warnings:Array.isArray(output.warnings)?output.warnings.slice(0,4):[],next:'Use music_overview or music_context for compact results'})}]};
   }finally{await rm(folder,{recursive:true,force:true})}
  });
 }
 const data=await exec(python,['-m','music_analyzer.cli',...cli],60000,musicRuntime(),name==='music_validate'?[0,2]:[0]);
 let output;
 try{output=JSON.parse(data.toString('utf8'))}catch{throw Error('Music analyzer returned invalid JSON')}
 return {content:[{type:'text',text:JSON.stringify(output)}]};
}


async function libraryTool(args){
 if(!Object.hasOwn(KINDS,args?.kind)||typeof args?.query!=='string'||!args.query.trim()||args.query.length>500)throw Error('Invalid library category or query');
 const limit=args?.limit??6;
 if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('Invalid library result limit');
 if(args?.duration!==undefined&&(!Number.isFinite(args.duration)||args.duration<0||args.duration>3600))throw Error('Invalid requested duration');
 const found=await searchLibrary(args.kind,args.query.trim(),{limit,duration:args.duration});
 const results=found.found.map(({item})=>({
  id:item.id,name:item.name?.en??item.id,kind:item.kind,
  ...(item.durationMs!=null?{duration_seconds:Math.round(item.durationMs/1000*10)/10}:{}),
  ...(item.bpm!=null?{bpm:item.bpm}:{}),
  ...(item.energy!=null?{energy:item.energy}:{}),
  ...(item.loop!=null?{loop:item.loop}:{})
 }));
 return {content:[{type:'text',text:JSON.stringify({kind:args.kind,query:args.query,worded:found.worded,count:results.length,results})}]};
}
async function libraryTake(args){
 if(!Object.hasOwn(KINDS,args?.kind)||typeof args?.id!=='string'||!args.id.trim()||args.id.length>500)throw Error('Invalid library item');
 const verb=Object.keys(LIBRARY_VERBS).find(v=>LIBRARY_VERBS[v].kind===args.kind);
 if(!verb)throw Error('Unsupported library category');
 if(!(await stat(join(project,'film.html')).catch(()=>null))?.isFile())throw Error('A film.html project is required');
 const response=await libraryGet(verb,{take:args.id},project);
 if(response.code!==0)throw Error(response.lines?.join(' ').slice(0,600)||'Library import failed');
 return {content:[{type:'text',text:JSON.stringify({status:'completed',kind:args.kind,id:args.id,details:(response.lines??[]).slice(0,8).map(line=>line.slice(0,500))})}]};
}
async function runText3D(name,args){
 let command,revision=null,folder=null;
 if(name==='text3d_apply'){
  if(typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision)||typeof args?.clip!=='string'||!args.clip.trim()||
     typeof args?.component_id!=='string'||!args.component_id.trim())throw Error('Invalid Text3D apply arguments');
  const film=await readProjectFilm(project);
  if(!film.value||film.rev!==args.revision)throw Error('Stale film revision; inspect again');
  const track=film.value.tracks.find(t=>(t.clips??[]).some(c=>c.id===args.clip));
  if(!track)throw Error('Clip not found');
  if(track.locked)throw Error('Cannot modify a locked track');
  if(!(await listText3D()).some(entry=>entry.componentId===args.component_id))throw Error('Text3D component is not registered');
  command=['apply',project,args.clip,args.component_id];
  revision=args.revision;
 }else{
  folder=await draftPath(project,args?.folder);
  if(name==='text3d_font_add'){
   if(typeof args.family!=='string'||!args.family.trim()||args.family.length>100||
      args.weight!==undefined&&(!Number.isInteger(args.weight)||args.weight<1||args.weight>1000))throw Error('Invalid Text3D font');
   command=['font-add',folder,args.family.trim(),String(args.weight??400)];
  }else{
   if(args?.visual_approved!==true)throw Error('Visual approval is required before publishing Text3D');
   command=['register',folder];
  }
 }
 return heavyJob(async()=>{
  if(name==='text3d_register')await requireVerifiedPreview(folder);
  const job={kind:'text3d-command',root:project,args:command,...(revision?{revision}:{})};
  const worker=fileURLToPath(new URL('./film-mcp-worker.mjs',import.meta.url));
  const bytes=await exec(process.execPath,[worker,JSON.stringify(job)],600000,{...process.env,ELECTRON_RUN_AS_NODE:'1'},[0],project);
  const log=bytes.toString('utf8'),marker='MCP_FILM_RESULT=',pos=log.lastIndexOf(marker);
  if(pos<0)throw Error('Text3D worker returned no completion receipt');
  let result;
  try{result=JSON.parse(log.slice(pos+marker.length).split('\n')[0])}catch{throw Error('Invalid Text3D worker receipt')}
  if(name==='text3d_apply'&&!/^[a-f0-9]{16}$/.test(result.revision??''))throw Error('Text3D apply returned no film revision');
  return {content:[{type:'text',text:JSON.stringify({
   status:name==='text3d_register'?'registered':name==='text3d_apply'?'applied':'font_added',
   ...(result.revision?{revision:result.revision}:{}),
   notes:(result.lines??[]).slice(0,3).map(x=>String(x).slice(0,250)),
   ...(name==='text3d_font_add'?{next:'Run text3d_preview with replace_preview:true before registering'}:{})
  })}]};
 });
}
async function text3dTool(name,args){
 if(name==='text3d_create'){
  if(typeof args?.name!=='string'||!/^[a-z][a-z0-9_-]{0,49}$/.test(args.name))throw Error('Invalid Text3D draft name');
  const parent=join(project,'.film','text3d-drafts');
  await mkdir(parent,{recursive:true});
  const base=await realpath(project),actualParent=await realpath(parent);
  const relParent=relative(base,actualParent);
  if(!relParent||relParent==='..'||relParent.startsWith('..'+sep)||isAbsolute(relParent))throw Error('Text3D draft directory must stay in the project');
  const folder=join(actualParent,args.name);
  if(await stat(folder).catch(()=>null))throw Error('Text3D draft already exists');
  const { text3DCommand }=await import('openfilm/text3d-cli');
  const made=await text3DCommand(['create',folder]);
  if(!made.ok)throw Error((made.lines??[]).join(' ').slice(0,500));
  return {content:[{type:'text',text:JSON.stringify({status:'created',folder:relative(project,folder),next:'Edit draft, then call text3d_validate'})}]};
 }
 if(name==='text3d_preview'){
  const target=await draftPath(project,args?.folder);
  return heavyJob(async()=>{
   const sourceBefore=await draftFingerprint(target);
   if(args?.replace_preview===true){
    const previous=target+'-preview';
    const info=await lstat(previous).catch(error=>{if(error?.code==='ENOENT')return null;throw error});
    if(info){
     if(!info.isDirectory()||info.isSymbolicLink())throw Error('Existing preview is not a regular folder');
     await rm(previous,{recursive:true});
    }
   }else if(args?.replace_preview!==undefined&&args.replace_preview!==false){
    throw Error('replace_preview must be a boolean');
   }
   const job={kind:'text3d-preview',root:project,source:target};
   const worker=fileURLToPath(new URL('./film-mcp-worker.mjs',import.meta.url));
   const bytes=await exec(process.execPath,[worker,JSON.stringify(job)],240000,{...process.env,ELECTRON_RUN_AS_NODE:'1',OPENFILM_NO_BROWSER:'1'},[0],project);
   const log=bytes.toString('utf8'),marker='MCP_FILM_RESULT=',pos=log.lastIndexOf(marker);
   if(pos<0)throw Error('Text3D preview worker returned no receipt');
   let result;try{result=JSON.parse(log.slice(pos+marker.length).split('\n')[0])}catch{throw Error('Invalid Text3D preview receipt')}
   const page=await realpath(result.preview);
   const relativePage=relative(root,page);
   if(relativePage==='..'||relativePage.startsWith('..'+sep)||isAbsolute(relativePage))throw Error('Text3D preview escapes project');
   if(await draftFingerprint(target)!==sourceBefore)throw Error('Text3D source changed during preview; verify again');
   await recordPreview(target);
   return {content:[{type:'text',text:JSON.stringify({status:'preview_bundled',preview_page:relativePage,notes:(result.lines??[]).slice(0,3).map(v=>String(v).slice(0,250)),next:'Inspect rendered frames before registering'})}]};
  });
 }
 if(name==='text3d_validate'){
  if(typeof args?.folder!=='string'||!args.folder.trim())throw Error('Invalid Text3D draft folder');
  const base=await realpath(join(project,'.film','text3d-drafts'));
  const root=await realpath(project),relBase=relative(root,base);
  if(!relBase||relBase==='..'||relBase.startsWith('..'+sep)||isAbsolute(relBase))throw Error('Text3D drafts directory escapes project');
  const target=await realpath(resolve(project,args.folder));
  const rel=relative(base,target);
  if(!rel||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('Text3D drafts must be inside .film/text3d-drafts');
  if(!(await stat(target)).isDirectory())throw Error('Text3D draft is not a directory');
  const { text3DCommand }=await import('openfilm/text3d-cli');
  const validation=await text3DCommand(['validate',target]);
  if(!validation.ok)throw Error((validation.lines??[]).join(' ').slice(0,700));
  return {content:[{type:'text',text:JSON.stringify({valid:true,folder:relative(project,target),message:(validation.lines??[]).join(' ').slice(0,450)})}]};
 }
 const entries=await listText3D();
 if(name==='text3d_inspect'){
  if(typeof args?.component_id!=='string'||!args.component_id.trim())throw Error('Invalid Text3D component ID');
  const entry=entries.find(e=>e.componentId===args.component_id);
  if(!entry)throw Error('Text3D component not found');
  const params=Object.entries(entry.parameterMap??{});
  return {content:[{type:'text',text:JSON.stringify({component_id:entry.componentId,source_id:entry.source2DId,display_name:entry.displayName,parameter_map:Object.fromEntries(params.slice(0,40)),parameters_truncated:params.length>40,bundle_path:entry.bundlePath,active:entry.active})}]};
 }
 if(args?.source_id!==undefined&&(typeof args.source_id!=='string'||args.source_id.length>150))throw Error('Invalid source filter');
 const limit=args?.limit??12,offset=args?.offset??0;
 if(!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(offset)||offset<0)throw Error('Invalid Text3D pagination');
 const chosen=args?.source_id?entries.filter(e=>e.source2DId===args.source_id):entries;
 const results=chosen.slice(offset,offset+limit).map(e=>({component_id:e.componentId,source_id:e.source2DId,display_name:e.displayName,active:e.active}));
 return {content:[{type:'text',text:JSON.stringify({total:chosen.length,offset,returned:results.length,next_offset:offset+limit<chosen.length?offset+limit:null,components:results})}]};
}

async function filmTool(name,args){
 if(!(await stat(join(project,'film.html')).catch(()=>null))?.isFile())throw Error('A film.html project is required');
 const worker=new URL('./film-mcp-worker.mjs',import.meta.url);
 const isRender=name==='film_render';
 const isRange=name==='film_preview_range';
 let output,revision,job,staging;
 if(isRender){
  if(typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision))throw Error('Invalid film revision');
  if(typeof args?.output!=='string'||!['.mp4','.webm','.mov'].includes(extname(args.output).toLowerCase()))throw Error('Output must be a new MP4, WebM or MOV');
  const hasRange=args.start!==undefined||args.end!==undefined;
  if(hasRange&&(!Number.isFinite(args.start)||!Number.isFinite(args.end)||args.start<0||args.end<=args.start))throw Error('Invalid export interval');
  if(args?.fps!==undefined&&(!Number.isFinite(args.fps)||args.fps<1||args.fps>60))throw Error('Invalid export FPS');
  const current=await readProjectFilm(project);
  if(!current.value||current.rev!==args.revision)throw Error('Stale or invalid film revision; inspect again');
  revision=current.rev;
  output=await safeOutput(args.output,extname(args.output).toLowerCase());
  job={kind:'render',root:project,range:hasRange?[args.start,args.end]:null,fps:args.fps??30};
 }else if(isRange){
  if(!Number.isFinite(args?.start)||!Number.isFinite(args?.end)||args.start<0||args.end<=args.start||
     args.end>86400||!Number.isInteger(args?.count??6)||(args.count??6)<2||(args.count??6)>12)throw Error('Invalid contact sheet range');
  job={kind:'look-range',root:project,start:args.start,end:args.end,count:args.count??6};
 }else{
  if(!Number.isFinite(args?.at)||args.at<0)throw Error('Invalid preview time');
  job={kind:'look',root:project,at:args.at};
 }
 return heavyJob(async()=>{
  try{
   if(isRender){
    // Render into a private sibling; link only after validation so a competing file cannot be replaced.
    staging=await mkdtemp(join(dirname(output),'.film-mcp-render-'));
    job.out=join(staging,'output'+extname(output).toLowerCase());
   }
   const bytes=await exec(process.execPath,[fileURLToPath(worker),JSON.stringify(job)],isRender?3600000:180000,{...process.env,ELECTRON_RUN_AS_NODE:'1',OPENFILM_NO_BROWSER:'1'},[0],project);
   const log=bytes.toString('utf8');
   const marker='MCP_FILM_RESULT=';
   const offset=log.lastIndexOf(marker);
   if(offset<0)throw Error('Film worker returned no completion receipt');
   let finished;
   try{finished=JSON.parse(log.slice(offset+marker.length).split('\n')[0])}catch{throw Error('Film worker receipt was not JSON')}
   if(isRender){
    const size=(await stat(job.out)).size;
    if(size===0)throw Error('Rendered file is empty');
    const current=await readProjectFilm(project);
    if(current.rev!==revision)throw Error('Film changed while rendering; render result not published');
    await link(job.out,output);
    return {content:[{type:'text',text:JSON.stringify({status:'rendered',revision,output:relative(project,output),bytes:size,encoder:finished.encoder,notes:(finished.lines??[]).slice(1,5).map(line=>String(line).slice(0,180))})}]};
   }
   const files=[];
   const canonicalProject=await realpath(project);
   for(const candidate of finished.files??[]){
    try{
     const file=await realpath(candidate);
     const rel=relative(canonicalProject,file);
     if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)||extname(file).toLowerCase()!=='.png')continue;
     files.push({path:rel,file});
    }catch{/* no image available */}
   }
   const content=[{type:'text',text:JSON.stringify({status:'previewed',...(isRange?{start:job.start,end:job.end,count:job.count}:{at:job.at}),files:files.map(f=>f.path).slice(0,2),notes:(finished.lines??[]).slice(0,8).map(line=>String(line).slice(0,180))})}];
   if(files.length){
    const size=(await stat(files[0].file)).size;
    if(size>0&&size<=1500000)content.push({type:'image',data:(await readFile(files[0].file)).toString('base64'),mimeType:'image/png'});
   }
   return {content};
  }finally{
   if(staging)await rm(staging,{recursive:true,force:true});
  }
 });
}

async function timelineMotionPreset(args){
 if(typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision))throw Error('Invalid film revision');
 const {rev,value}=await readProjectFilm(project);
 if(!value||rev!==args.revision)throw Error('Stale or invalid film revision');
 const {ops,applied,seconds}=await motionPresetOps(value,args);
 const receipt=await guardedTimelineOps(rev,ops,{operation:'timeline_apply_motion_preset',clip:args.clip,slot:args.slot,preset_id:applied,seconds});
 return receipt;
}
const TIMELINE_EXTENSIONS=new Set(['.mp4','.mov','.webm','.mkv','.avi','.m4v','.wav','.mp3','.m4a','.flac','.ogg','.png','.jpg','.jpeg','.webp','.gif','.html']);
async function timelineClipSource(path){
 return timelineSource(project,path,raw=>safePath(raw,TIMELINE_EXTENSIONS));
}

async function timelineAdvanced(name,args){
 if(typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision))throw Error('Invalid timeline revision');
 let ops;
 if(name==='timeline_set_properties'){
  ops=[{op:'props',edits:propertyEdits(args.edits)}];
 }else{
  ops=await batchOps(args.steps,async path=>{
   const src=await timelineClipSource(path);
   if(!clipKind(src))throw Error('Unsupported clip kind');
   return src;
  });
 }
 return guardedTimelineOps(args.revision,ops,{operation:name,operations:ops.length});
}

async function timelineGetMotion(args){
 if(typeof args?.clip!=='string'||!args.clip.trim())throw Error('Invalid clip id');
 const {rev,value}=await readProjectFilm(project);
 if(!value)throw Error('Invalid film.html');
 const clip=value.tracks.flatMap(t=>t.clips??[]).find(c=>c.id===args.clip);
 if(!clip)throw Error('Clip not found');
 return {content:[{type:'text',text:JSON.stringify({revision:rev,clip:clip.id,motion:readMotion(clip,value.keyframes)})}]};
}
async function timelineGetClip(args){
 if(typeof args?.clip!=='string'||!args.clip.trim())throw Error('Invalid clip id');
 const {rev,value,problems}=await readProjectFilm(project);
 if(!value)throw Error('Invalid film.html: '+problems.join('; ').slice(0,300));
 for(const [track,t] of value.tracks.entries()){
  const clip=t.clips?.find(c=>c.id===args.clip);
  if(clip)return {content:[{type:'text',text:JSON.stringify({revision:rev,track,kind:kindOf(clip),clip})}]};
 }
 throw Error('Clip not found');
}
async function timelineAssetEdit(name,args){
 if(typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision))throw Error('Invalid timeline revision');
 if(name==='timeline_remove_clip'){
  if(typeof args.clip!=='string'||!args.clip.trim())throw Error('Invalid clip');
  return guardedTimelineOps(args.revision,[{op:'remove',clip:args.clip}],{operation:name,removed_clip_id:args.clip});
 }
 if(typeof args?.path!=='string'||!args.path.trim()||!Number.isFinite(args.at)||args.at<0)throw Error('Invalid asset insert parameters');
 if(args.track!==undefined&&(!Number.isInteger(args.track)||args.track<0))throw Error('Invalid track index');
 if(args.time!==undefined&&(!Array.isArray(args.time)||args.time.length!==2||!args.time.every(Number.isFinite)||args.time[0]<0||args.time[1]<=args.time[0]))throw Error('Invalid asset time interval');
 const src=await timelineClipSource(args.path);
 if(!clipKind(src))throw Error('Unsupported clip kind');
 const doc=await readProjectFilm(project);
 if(!doc.value)throw Error('Invalid film.html');
 if(doc.rev!==args.revision)throw Error('Stale timeline revision; inspect again');
 if(args.track!==undefined&&args.track>=doc.value.tracks.length)throw Error('Target track does not exist. Omit track to let Studio create a track automatically'+(doc.value.tracks.length===0?' in this empty project':'')+'.');
 const clip={src,...(args.time?{time:args.time}:{})};
 const op={op:'insert',clip,at:args.at,...(args.track!==undefined?{track:args.track}:{})};
 return guardedTimelineOps(args.revision,[op],{operation:name,source:src,at:args.at});
}

async function canvasApply(args){
 if(!Array.isArray(args?.ops)||args.ops.length===0||args.ops.length>30||args.ops.some(op=>!op||typeof op!=='object'||Array.isArray(op)))throw Error('Invalid canvas steps');
 const boards=await listBoards(project);
 const board=args?.board??(boards.length===1?'main':null);
 if(!board||!boards.some(item=>item.id===board))throw Error('Specify an existing canvas board before editing');
 const current=await readCanvas(project,board);
 const revision=args?.revision??canvasRevision(current);
 if(typeof revision!=='string'||!/^[a-f0-9]{16}$/.test(revision))throw Error('Invalid canvas revision');
 const payload={folder:project,board,revision,ops:args.ops};
 if(Buffer.byteLength(JSON.stringify(payload))>40000)throw Error('Canvas operation payload exceeds 40 KB');
 const { running }=await import('openfilm/studio-client');
 const studio=await running();
 if(!studio)throw Error('Studio is not running; open the project in Studio before editing its canvas');
 const res=await fetch(studio.origin+'/api/canvas',{
  method:'POST',
  headers:{'content-type':'application/json','x-studio-key':studio.key},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)
 });
 if(!res.ok)throw Error('Studio rejected canvas edit: HTTP '+res.status);
 const answer=await res.json();
 if(!answer?.ok)throw Error('Canvas edit rejected: '+String(answer?.text??answer?.error??'invalid steps'));
 return {content:[{type:'text',text:JSON.stringify({status:'updated',board,revision:answer.revision,added:answer.added??[],nodes:answer.canvas?.nodes?.length??0,edges:answer.canvas?.edges?.length??0})}]};
}

async function canvasTool(name,args){
 if(!(await stat(join(project,'film.html')).catch(()=>null))?.isFile())throw Error('A film.html project is required');
 const boards=await listBoards(project);
 if(name==='canvas_list')return {content:[{type:'text',text:JSON.stringify({boards})}]};
 const board=args?.board??'main';
 if(typeof board!=='string'||!boards.some(b=>b.id===board))throw Error('Canvas board not found');
 const canvas=await readCanvas(project,board);
 if(args?.node!==undefined){
  if(typeof args.node!=='string'||!args.node)throw Error('Invalid node id');
  const node=canvas.nodes.find(n=>n.id===args.node);
  if(!node)throw Error('Canvas node not found');
  return {content:[{type:'text',text:JSON.stringify({board,revision:canvasRevision(canvas),node,edges:canvas.edges.filter(e=>e.from===node.id||e.to===node.id)})}]};
 }
 const limit=args?.limit??20,offset=args?.offset??0;
 if(!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(offset)||offset<0)throw Error('Invalid canvas pagination');
 const all=canvas.nodes;
 const nodes=all.slice(offset,offset+limit).map(n=>({
  id:n.id,kind:n.make??(n.cut?'cut':n.group!==undefined?'group':n.path?'file':'note'),
  ...(n.title?{title:n.title}:{}),...(n.text?{text:n.text.slice(0,140)}:{}),
  ...(n.path?{path:n.path}:{}),...(n.parent?{parent:n.parent}:{})
 }));
 return {content:[{type:'text',text:JSON.stringify({board,revision:canvasRevision(canvas),total:all.length,edge_count:canvas.edges.length,offset,returned:nodes.length,next_offset:offset+limit<all.length?offset+limit:null,nodes})}]};
}
async function timelineEdit(name,args){
 if(name==='timeline_split_clip'){
  const validRange=t=>Array.isArray(t)&&t.length===2&&t.every(v=>Number.isFinite(v)&&v>=0)&&t[1]>t[0];
  const explicit=args?.left_time!==undefined||args?.right_time!==undefined;
  if(typeof args?.clip!=='string'||!args.clip.trim()||typeof args?.revision!=='string'||!/^[a-f0-9]{16}$/.test(args.revision)||!Number.isFinite(args.at)||args.at<=0)throw Error('Invalid split parameters');
  if(explicit&&(!validRange(args.left_time)||!validRange(args.right_time)||Math.abs(args.left_time[1]-args.right_time[0])>0.002))throw Error('Invalid or discontinuous source intervals');
  return guardedTimelineOps(args.revision,[{op:'split',clip:args.clip,at:args.at,...(explicit?{time:args.left_time,restTime:args.right_time}:{})}],{clip:args.clip,at:args.at,operation:name});
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
   const sourceCut=Math.round((clip.time[0]+(op.at-beginning)*speed)*1000)/1000;
   if(!Number.isFinite(sourceCut)||sourceCut<=clip.time[0]+0.001||sourceCut>=clip.time[1]-0.001)throw Error('Split point must be strictly inside the clip');
   if(!op.time&&!op.restTime){
    op.time=[clip.time[0],sourceCut];
    op.restTime=[sourceCut,clip.time[1]];
   }
   if(!Array.isArray(op.time)||!Array.isArray(op.restTime)||Math.abs(clip.time[0]-op.time[0])>0.002||Math.abs(clip.time[1]-op.restTime[1])>0.002||Math.abs(op.time[1]-sourceCut)>0.002||Math.abs(op.restTime[0]-sourceCut)>0.002)throw Error('Split must match clip source trim, speed and timeline time');
  }
  const clipTrack=new Map(value.tracks.flatMap((track,index)=>(track.clips??[]).map(clip=>[clip.id,index])));
  const newlyLocked=new Set(ops.filter(op=>op.op==='track'&&op.field==='locked'&&op.value===true).map(op=>op.track));
  const initialIds=new Set(clipTrack.keys());
  const insertedIds=new Set();
  for(const op of ops){
   const touched=op.op==='props'?op.edits.map(edit=>edit.clip):['set','move','remove','split'].includes(op.op)?[op.clip]:[];
   for(const clipId of touched){
    const index=clipTrack.get(clipId);
    if(index===undefined && !insertedIds.has(clipId))throw Error('Clip not found: '+clipId);
    if(index!==undefined && (value.tracks[index].locked||newlyLocked.has(index)))throw Error('Track is locked: '+index);
   }
   if(op.op==='insert'){
    if(op.from!==undefined&&!initialIds.has(op.from))throw Error('Source clip not found');
    if(op.track===undefined&&value.tracks.some(track=>track.locked))throw Error('Specify an unlocked destination track when the project has locked tracks');
    if(op.track!==undefined&&(!value.tracks[op.track]||value.tracks[op.track].locked||newlyLocked.has(op.track)))throw Error('Target track missing or locked. Omit track to let Studio select or create an appropriate unlocked track.');
    const newId=op.clip?.id;
    if(newId!==undefined){
     if(initialIds.has(newId)||insertedIds.has(newId))throw Error('New clip ID already in use');
     insertedIds.add(newId);
    }
   }
   if(op.op==='move'&&op.track!==undefined&&(!value.tracks[op.track]||value.tracks[op.track].locked||newlyLocked.has(op.track)))throw Error('Target track missing or locked');
   if(op.op==='track'){
    const track=value.tracks[op.track];
    if(!track)throw Error('Track not found');
    if(track.locked && !(op.field==='locked'&&op.value===false))throw Error('Track is locked: '+op.track);
   }
  }
  const edited=applyOps(value,ops);
  const checked=readFilm(edited);
  if(!checked.doc)throw Error(checked.problems.join('; '));
  return {value:edited};
 },{ops});
 const beforeIds=new Set((result.current.value?.tracks??[]).flatMap(t=>t.clips??[]).map(c=>c.id));
 const created=result.value.tracks.flatMap(t=>t.clips??[]).find(c=>!beforeIds.has(c.id));
 const details=ops[0]?.op==='insert'?{new_clip_id:created?.id??null}:ops[0]?.op==='split'?{right_clip_id:created?.id??null,left_time:ops[0].time,right_time:ops[0].restTime}:{};
 const newClipIds=result.value.tracks.flatMap(t=>t.clips??[]).filter(c=>!beforeIds.has(c.id)).map(c=>c.id).slice(0,25);
 return {content:[{type:'text',text:JSON.stringify({status:'updated',revision:result.rev,...summary,...details,...(summary.operation==='timeline_apply_batch'?{new_clip_ids:newClipIds}:{})})}]};
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
// Opt-in performance diagnostics. Never print arguments, file paths, credentials or returned content.
function measure(method,name,started,response){
 if(process.env.VIDEOMAKER_MCP_METRICS!=='1')return;
 const elapsedMs=Math.round(Number(process.hrtime.bigint()-started)/1e6*10)/10;
 const outputBytes=Buffer.byteLength(JSON.stringify(response??{}));
 process.stderr.write('MCP_METRIC '+JSON.stringify({
  method,tool:method==='tools/call'?(tools.some(t=>t.name===name)?name:'unknown'):null,
  ok:!response?.isError,elapsed_ms:elapsedMs,response_bytes:outputBytes
 })+'\n');
}
const rl=createInterface({input:process.stdin,crlfDelay:Infinity});
rl.on('line',async line=>{
 let msg;try{msg=JSON.parse(line)}catch{return}
 if(msg.id===undefined)return;
 const started=process.hrtime.bigint();
 try{
  let result;
  switch(msg.method){
   case 'initialize':result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'videomaker-media',version:'1.0.0'}};break;
   case 'ping':result={};break;
   case 'tools/list':result={tools};break;
   case 'tools/call':result=msg.params?.name==='project_page_update'?{content:[{type:'text',text:JSON.stringify(await projectPage(project,msg.params?.arguments))}]}:msg.params?.name==='film_audit'?{content:[{type:'text',text:JSON.stringify(await (async()=>{
  const film=await readProjectFilm(project);
  if(!film.value)throw Error('Invalid film.html');
  return auditFilm(project,film.value,film.rev,msg.params?.arguments?.expected_seconds);
 })())}]}:msg.params?.name==='canvas_manage_board'?{content:[{type:'text',text:JSON.stringify(await manageBoard(project,msg.params?.arguments))}]}:
['captions_transcribe','captions_translate','caption_tracks','caption_track_cues'].includes(msg.params?.name)?
 {content:[{type:'text',text:JSON.stringify(
  ['captions_transcribe','captions_translate'].includes(msg.params.name)||
  (msg.params.name==='caption_tracks'&&msg.params.arguments?.action==='translate')?
  await heavyJob(()=>captionActions(project,msg.params.name,msg.params?.arguments)):
  await captionActions(project,msg.params.name,msg.params?.arguments)
 )}]}:['text3d_font_add','text3d_register','text3d_apply'].includes(msg.params?.name)?await runText3D(msg.params.name,msg.params?.arguments):msg.params?.name==='motion_presets'?{content:[{type:'text',text:JSON.stringify(await motionPresetList(msg.params?.arguments))}]}:msg.params?.name==='timeline_apply_motion_preset'?await timelineMotionPreset(msg.params?.arguments):['captions_list','captions_style','captions_correct_line'].includes(msg.params?.name)?{content:[{type:'text',text:JSON.stringify(await captionTool(project,msg.params.name,msg.params?.arguments))}]}:msg.params?.name==='timeline_get_motion'?await timelineGetMotion(msg.params?.arguments):['timeline_set_properties','timeline_apply_batch'].includes(msg.params?.name)?await timelineAdvanced(msg.params.name,msg.params?.arguments):['film_preview_frame','film_preview_range','film_render'].includes(msg.params?.name)?await filmTool(msg.params.name,msg.params?.arguments):msg.params?.name==='library_take'?await libraryTake(msg.params?.arguments):['text3d_list','text3d_inspect','text3d_validate','text3d_create','text3d_preview'].includes(msg.params?.name)?await text3dTool(msg.params.name,msg.params?.arguments):msg.params?.name==='timeline_get_clip'?await timelineGetClip(msg.params?.arguments):['timeline_insert_asset','timeline_remove_clip'].includes(msg.params?.name)?await timelineAssetEdit(msg.params.name,msg.params?.arguments):msg.params?.name==='library_search'?await libraryTool(msg.params?.arguments):msg.params?.name==='canvas_apply'?await canvasApply(msg.params?.arguments):['canvas_list','canvas_nodes'].includes(msg.params?.name)?await canvasTool(msg.params.name,msg.params?.arguments):['timeline_move_clip','timeline_duplicate_clip','timeline_set_playback','timeline_split_clip'].includes(msg.params?.name)?await timelineEdit(msg.params.name,msg.params?.arguments):['timeline_overview','timeline_clips'].includes(msg.params?.name)?await timelineTool(msg.params.name,msg.params?.arguments):msg.params?.name==='reverse_video'?await reverseVideo(msg.params?.arguments):['music_analyze','music_decode','music_overview','music_context','music_cues','music_validate','music_compare','music_inspect'].includes(msg.params?.name)?await musicTool(msg.params.name,msg.params?.arguments):msg.params?.name==='inspect_video'?await heavyJob(()=>inspect(msg.params.name,msg.params?.arguments)):await inspect(msg.params?.name,msg.params?.arguments);break;
   default:send({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Method not found'}});return;
  }
  send({jsonrpc:'2.0',id:msg.id,result});
  measure(msg.method,msg.params?.name,started,result);
 }catch(e){
  const failure={isError:true,content:[{type:'text',text:String(e.message||e)}]};
  send({jsonrpc:'2.0',id:msg.id,result:failure});
  measure(msg.method,msg.params?.name,started,failure);
 }
});
