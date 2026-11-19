import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filmHtml, readFilmFile } from '../../../packages/openfilm/src/film-doc.mjs';
import { EMPTY_FILM } from '../../../packages/openfilm/studio/server/film.mjs';

test('MCP builds five HTML scenes and two audio clips from an empty Studio film without direct timeline writes', {timeout:100000},async()=>{
 const project=await mkdtemp(join(tmpdir(),'videomaker-empty-mcp-'));
 const outside=await mkdtemp(join(tmpdir(),'videomaker-outside-mcp-'));
 const script=fileURLToPath(new URL('./media-mcp.mjs',import.meta.url));
 let child;
 try{
  await writeFile(join(project,'film.html'),filmHtml(EMPTY_FILM));
  await mkdir(join(project,'cenas'));
  for(let i=0;i<5;i++)await writeFile(join(project,'cenas','cena-'+(i+1)+'.html'),
   '<!doctype html><html><body><script>window.film={width:320,height:180,duration:8,frame(t){}};</script></body></html>');
  await writeFile(join(outside,'outside.html'),'<html></html>');
  let symlinkCreated=false;
  try{await symlink(join(outside,'outside.html'),join(project,'cenas','outside.html'));symlinkCreated=true}
  catch(error){if(process.platform!=='win32'||!['EPERM','EACCES'].includes(error.code))throw error}
  child=spawn(process.execPath,[script],{env:{...process.env,VIDEOMAKER_PROJECT:project},stdio:['pipe','pipe','pipe']});
  let buffer='',seq=0;const pending=new Map();
  child.stdout.on('data',bytes=>{
   buffer+=bytes.toString();
   while(buffer.includes('\n')){
    const n=buffer.indexOf('\n'),line=buffer.slice(0,n);buffer=buffer.slice(n+1);
    if(!line.trim())continue;
    const message=JSON.parse(line),callback=pending.get(message.id);
    if(callback){pending.delete(message.id);callback(message)}
   }
  });
  const request=(name,args={})=>new Promise((resolve,reject)=>{
   const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('MCP empty project timeout: '+name))},25000);
   pending.set(id,reply=>{clearTimeout(timer);resolve(reply)});
   child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})+'\n');
  });
  const call=async(name,args={})=>{
   const response=await request(name,args);
   assert.equal(response.result?.isError,undefined,JSON.stringify(response.result));
   return JSON.parse(response.result.content[0].text);
  };
  const first=await call('timeline_overview');
  assert.equal(first.clip_count,0);
  assert.equal(first.track_count,0);
  const original=await readFile(join(project,'film.html'),'utf8');
  for(const path of ['film.html','../outside.html',...(symlinkCreated?['cenas/outside.html']:[]),'.film/private.html']){
   const denied=await request('timeline_insert_asset',{path,revision:first.revision,at:0,time:[0,8]});
   assert.equal(denied.result.isError,true,'Must reject: '+path);
  }
  const badTrack=await request('timeline_insert_asset',{path:'cenas/cena-1.html',revision:first.revision,at:0,track:0,time:[0,8]});
  assert.equal(badTrack.result.isError,true);
  assert.match(badTrack.result.content[0].text,/omit.*track|track.*omit/i);
  assert.equal(await readFile(join(project,'film.html'),'utf8'),original);
  const opening=await call('timeline_insert_asset',{path:'cenas/cena-1.html',revision:first.revision,at:0,time:[0,8]});
  assert.ok(opening.new_clip_id);
  const scene=await call('timeline_get_clip',{clip:opening.new_clip_id});
  assert.equal(scene.clip.src,'cenas/cena-1.html');
  const stale=await request('timeline_insert_asset',{path:'cenas/cena-2.html',revision:first.revision,at:8,time:[0,8]});
  assert.equal(stale.result.isError,true);
  await mkdir(join(project,'assets'));
  await writeFile(join(project,'assets','narracao.wav'),'narration fixture');
  await writeFile(join(project,'assets','trilha.mp3'),'music fixture');
  const batch=await call('timeline_apply_batch',{revision:opening.revision,steps:[
   ...[2,3,4,5].map(i=>({op:'insert_asset',id:'scene-'+i,path:'cenas/cena-'+i+'.html',at:(i-1)*8,time:[0,8]})),
   {op:'insert_asset',id:'narracao',path:'assets/narracao.wav',at:0,time:[0,40]},
   {op:'insert_asset',id:'trilha',path:'assets/trilha.mp3',at:0,time:[0,40]}
  ]});
  assert.equal(batch.new_clip_ids.length,6);
  const film=readFilmFile(await readFile(join(project,'film.html'),'utf8'));
  assert.ok(film.doc,film.problems.join('; '));
  assert.equal(film.value.tracks.flatMap(t=>t.clips).length,7);
  assert.equal(new Set(film.value.tracks.flatMap(t=>t.clips).map(c=>c.id)).size,7);
  assert.equal(film.value.tracks.flatMap(t=>t.clips).filter(c=>c.src.endsWith('.html')).length,5);
  const audited=await call('film_audit',{expected_seconds:40});
  assert.equal(audited.duration_confirmed,true,JSON.stringify(audited));
  assert.equal(audited.expected_duration_matches,true);
  const beforeReject=await readFile(join(project,'film.html'),'utf8');
  const badBatch=await request('timeline_apply_batch',{revision:batch.revision,steps:[
   {op:'insert_asset',path:'cenas/cena-2.html',at:0,time:[0,8]},
   {op:'insert_asset',path:'../outside.html',at:8,time:[0,8]}
  ]});
  assert.equal(badBatch.result.isError,true);
  assert.equal(await readFile(join(project,'film.html'),'utf8'),beforeReject);
  const invalidMedia=await request('timeline_insert_asset',{revision:batch.revision,path:'cenas/narracao.wav',at:0,time:[0,2]});
  assert.equal(invalidMedia.result.isError,true);
  const editTrack=film.value.tracks.findIndex(t=>t.clips.some(c=>c.id===opening.new_clip_id));
  const locked=await call('timeline_apply_batch',{revision:batch.revision,steps:[{op:'track',track:editTrack,field:'locked',value:true}]});
  const deniedLocked=await request('timeline_remove_clip',{revision:locked.revision,clip:opening.new_clip_id});
  assert.equal(deniedLocked.result.isError,true);
 }finally{
  if(child){child.kill();child.stdin.destroy()}
  await rm(project,{recursive:true,force:true});
  await rm(outside,{recursive:true,force:true});
 }
});
