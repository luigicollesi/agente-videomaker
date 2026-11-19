import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, stat, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('advanced analyzer MCP options invoke existing Python CLI and decode files atomically',{
 skip:process.platform==='win32'?'POSIX fake Python executable fixture':false,timeout:60000
},async()=>{
 const project=await mkdtemp(join(tmpdir(),'videomaker-music-advanced-'));
 let child;
 try{
  await mkdir(join(project,'assets'));
  await writeFile(join(project,'assets','song.wav'),Buffer.from('fake input for test'));
  const python=join(project,'test-python');
  await writeFile(python,[
   '#!/usr/bin/env node',
   'const fs=require("node:fs");const argv=process.argv.slice(2);const cmd=argv[2];',
   'const arg=k=>argv[argv.indexOf(k)+1];',
   'if(cmd==="decode"){fs.writeFileSync(arg("--pcm-output"),Buffer.alloc(64));fs.writeFileSync(arg("--metadata-output"),"{}");console.log(JSON.stringify({status:"decoded_only"}));}',
   'else if(cmd==="analyze"){fs.writeFileSync(arg("--output"),"{}");console.log(JSON.stringify({status:"analyzed",warnings:[],args:argv}));}',
   'else if(cmd==="validate"){console.log(JSON.stringify({valid:true}));}',
   'else console.log(JSON.stringify({command:cmd,args:argv}));'
  ].join('\n'));
  await chmod(python,0o755);
  const script=fileURLToPath(new URL('./media-mcp.mjs',import.meta.url));
  child=spawn(process.execPath,[script],{env:{...process.env,VIDEOMAKER_PROJECT:project,VIDEOMAKER_PYTHON:python},stdio:['pipe','pipe','pipe']});
  const pending=new Map();let buffer='',next=0;
  child.stdout.on('data',chunk=>{
   buffer+=chunk.toString();
   while(buffer.includes('\n')){
    const cut=buffer.indexOf('\n'),line=buffer.slice(0,cut);
    buffer=buffer.slice(cut+1);
    if(!line.trim())continue;
    const reply=JSON.parse(line),done=pending.get(reply.id);
    if(done){pending.delete(reply.id);done(reply)}
   }
  });
  const call=(name,args={})=>new Promise((resolve,reject)=>{
   const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('MCP timeout: '+name))},30000);
   pending.set(id,reply=>{clearTimeout(timer);resolve(reply)});
   child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})+'\n');
  });
  const ok=async(name,args)=>{
   const response=await call(name,args);
   assert.notEqual(response.result?.isError,true,JSON.stringify(response.result));
   return JSON.parse(response.result.content[0].text);
  };
  const inspection=await ok('music_inspect',{path:'assets/song.wav',audio_stream:1});
  assert.deepEqual(inspection.args.slice(-2),['--audio-stream','1']);
  const decoded=await ok('music_decode',{path:'assets/song.wav',pcm_output:'assets/pcm.f32le',metadata_output:'assets/pcm.json',sample_rate:16000,audio_stream:1});
  assert.equal(decoded.pcm_bytes,64);
  assert.equal((await stat(join(project,decoded.metadata_path))).size,2);
  const original=await readFile(join(project,'assets','pcm.f32le'));
  const duplicate=await call('music_decode',{path:'assets/song.wav',pcm_output:'assets/pcm.f32le',metadata_output:'assets/other.json'});
  assert.equal(duplicate.result.isError,true);
  assert.deepEqual(await readFile(join(project,'assets','pcm.f32le')),original);
  const analyzed=await ok('music_analyze',{path:'assets/song.wav',output:'assets/analyzed.json',audio_stream:2,use_cache:true,experimental_structure_v3:true});
  assert.equal(analyzed.validated,true);
  const cues=await ok('music_cues',{path:'assets/analyzed.json',start:0,end:5,limit:3,categories:['beat','onset'],selection:'chronological',min_relative_strength:0.4,merge_coincident:true,merge_window_ms:50});
  assert.ok(cues.args.includes('--merge-coincident'));
  assert.ok(cues.args.includes('chronological'));
  assert.ok(cues.args.includes('--categories'));
  const bad=await call('music_cues',{path:'assets/analyzed.json',start:0,end:5,categories:['unknown']});
  assert.equal(bad.result.isError,true);
 }finally{if(child){child.kill();child.stdin.destroy()}await rm(project,{recursive:true,force:true})}
});
