import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const enabled=process.env.VIDEOMAKER_MCP_INTEGRATION==='1' && process.platform==='linux';
test('real FFmpeg reversal and offline music analysis through MCP', {skip:!enabled,timeout:240000},async()=>{
 const project=await mkdtemp(join(tmpdir(),'videomaker-mcp-real-'));
 const script=fileURLToPath(new URL('./media-mcp.mjs',import.meta.url));
 let child;
 try{
  await mkdir(join(project,'assets'));
  const video=join(project,'assets','video.mp4');
  const song=join(project,'assets','song.wav');
  function ffmpeg(args){
   const result=spawnSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y',...args],{encoding:'utf8',timeout:30000});
   assert.equal(result.status,0,result.stderr||String(result.error));
  }
  ffmpeg(['-f','lavfi','-i','color=c=red:s=160x90:r=12:d=1.5','-c:v','libx264','-pix_fmt','yuv420p',video]);
  ffmpeg(['-f','lavfi','-i','sine=frequency=440:sample_rate=22050:duration=8','-c:a','pcm_s16le',song]);
  child=spawn(process.execPath,[script],{env:{...process.env,VIDEOMAKER_PROJECT:project},stdio:['pipe','pipe','pipe']});
  let buffer='',id=0;const pending=new Map();
  child.stdout.on('data',data=>{
   buffer+=data.toString();
   while(buffer.includes('\n')){
    const cut=buffer.indexOf('\n'),line=buffer.slice(0,cut);buffer=buffer.slice(cut+1);
    if(!line.trim())continue;
    const reply=JSON.parse(line),done=pending.get(reply.id);
    if(done){pending.delete(reply.id);done(reply)}
   }
  });
  const call=(name,args)=>new Promise((resolve,reject)=>{
   const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('MCP response timeout'))},180000);
   pending.set(key,reply=>{clearTimeout(timer);resolve(reply)});
   child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:key,method:'tools/call',params:{name,arguments:args}})+'\n');
  });
  const reversed=await call('reverse_video',{path:'assets/video.mp4',output:'assets/reversed.mp4'});
  assert.notEqual(reversed.result?.isError,true,JSON.stringify(reversed.result));
  assert.ok((await stat(join(project,'assets','reversed.mp4'))).size>0);
  const before=await readFile(join(project,'assets','reversed.mp4'));
  const again=await call('reverse_video',{path:'assets/video.mp4',output:'assets/reversed.mp4'});
  assert.equal(again.result.isError,true);
  assert.deepEqual(await readFile(join(project,'assets','reversed.mp4')),before);
  const analyzed=await call('music_analyze',{path:'assets/song.wav',output:'assets/analysis.json'});
  assert.notEqual(analyzed.result?.isError,true,JSON.stringify(analyzed.result));
  const json=JSON.parse(await readFile(join(project,'assets','analysis.json'),'utf8'));
  assert.equal(json.schema_version,'1.0.0');
  const overview=await call('music_overview',{path:'assets/analysis.json'});
  assert.notEqual(overview.result?.isError,true,JSON.stringify(overview.result));
 }finally{
  if(child){child.kill();child.stdin.destroy()}
  await rm(project,{recursive:true,force:true});
 }
});
