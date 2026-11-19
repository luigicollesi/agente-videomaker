import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filmHtml, readFilmFile } from '../../../packages/openfilm/src/film-doc.mjs';

test('Media MCP applies revision-guarded timeline edits to a real film', async () => {
 const project=await mkdtemp(join(tmpdir(),'videomaker-timeline-mcp-'));
 const script=fileURLToPath(new URL('./media-mcp.mjs',import.meta.url));
 let child;
 try {
  await mkdir(join(project,'assets'));
  await writeFile(join(project,'assets','overlay.png'),Buffer.from('asset retained outside timeline'));
  const initial={stage:{w:1920,h:1080},tracks:[{clips:[{id:'source-clip',src:'assets/sample.mp4',at:0,time:[0,10]}]}]};
  await writeFile(join(project,'film.html'),filmHtml(initial));
  child=spawn(process.execPath,[script],{env:{...process.env,VIDEOMAKER_PROJECT:project},stdio:['pipe','pipe','pipe']});
  let pending=new Map(), buffer='', id=0;
  child.stdout.on('data',chunk=>{
   buffer+=chunk.toString();
   while(buffer.includes('\n')){
    const pos=buffer.indexOf('\n'),line=buffer.slice(0,pos);buffer=buffer.slice(pos+1);
    if(!line.trim())continue;
    const message=JSON.parse(line);
    const resolve=pending.get(message.id);
    if(resolve){pending.delete(message.id);resolve(message)}
   }
  });
  const request=(method,params={})=>new Promise((resolve,reject)=>{
   const key=++id;
   const timer=setTimeout(()=>{pending.delete(key);reject(Error('MCP request timeout'))},10000);
   pending.set(key,result=>{clearTimeout(timer);resolve(result)});
   child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:key,method,params})+'\n');
  });
  const call=async(name,args={})=>{
   const reply=await request('tools/call',{name,arguments:args});
   assert.notEqual(reply.result?.isError,true,JSON.stringify(reply.result));
   return JSON.parse(reply.result.content[0].text);
  };
  const invalidPreview=await request('tools/call',{name:'film_preview_frame',arguments:{at:-1}});
  assert.equal(invalidPreview.result.isError,true);
  const badFps=await request('tools/call',{name:'film_render',arguments:{revision:'0000000000000000',output:'assets/export.mp4',fps:500}});
  assert.equal(badFps.result.isError,true);
  const wrongFormat=await request('tools/call',{name:'film_render',arguments:{revision:'0000000000000000',output:'assets/export.txt'}});
  assert.equal(wrongFormat.result.isError,true);
  const current=await call('timeline_overview');
  assert.equal(current.clip_count,1);
  const staleRender=await request('tools/call',{name:'film_render',arguments:{revision:'0000000000000000',output:'assets/export.mp4'}});
  assert.equal(staleRender.result.isError,true);
  const stale=await request('tools/call',{name:'timeline_move_clip',arguments:{clip:'source-clip',revision:'0000000000000000',at:3}});
  assert.equal(stale.result.isError,true);
  const moved=await call('timeline_move_clip',{clip:'source-clip',revision:current.revision,at:2});
  assert.notEqual(moved.revision,current.revision);
  const speed=await call('timeline_set_playback',{clip:'source-clip',revision:moved.revision,field:'speed',value:2});
  const duplicated=await call('timeline_duplicate_clip',{clip:'source-clip',revision:speed.revision,at:12});
  assert.ok(duplicated.new_clip_id);
  assert.notEqual(duplicated.new_clip_id,'source-clip');
  const firstPage=await call('timeline_clips',{limit:1,offset:0});
  assert.equal(firstPage.total,2);
  assert.equal(firstPage.returned,1);
  assert.equal(firstPage.next_offset,1);
  const secondPage=await call('timeline_clips',{limit:1,offset:firstPage.next_offset});
  assert.equal(secondPage.returned,1);
  assert.equal(secondPage.next_offset,null);
  assert.notEqual(firstPage.clips[0].id,secondPage.clips[0].id);
  const pastEnd=await call('timeline_clips',{limit:1,offset:500});
  assert.equal(pastEnd.returned,0);
  assert.equal(pastEnd.next_offset,null);
  const invalidPage=await request('tools/call',{name:'timeline_clips',arguments:{limit:1,offset:-1}});
  assert.equal(invalidPage.result.isError,true);
  let film=readFilmFile(await readFile(join(project,'film.html'),'utf8'));
  assert.ok(film.doc,film.problems.join('; '));
  let clips=film.value.tracks.flatMap(t=>t.clips);
  assert.equal(clips.length,2);
  assert.ok(clips.some(c=>c.id==='source-clip'&&c.at===2&&c.speed===2));
  const split=await call('timeline_split_clip',{clip:'source-clip',revision:duplicated.revision,at:4.5});
  assert.deepEqual(split.left_time,[0,5]);
  assert.deepEqual(split.right_time,[5,10]);
  assert.ok(split.right_clip_id);
  assert.notEqual(split.right_clip_id,duplicated.new_clip_id);
  assert.notEqual(split.revision,duplicated.revision);
  film=readFilmFile(await readFile(join(project,'film.html'),'utf8'));
  assert.ok(film.doc,film.problems.join('; '));
  clips=film.value.tracks.flatMap(t=>t.clips);
  assert.equal(clips.length,3);
  assert.ok(clips.some(c=>c.id==='source-clip'&&c.time[1]===5));
  assert.ok(clips.some(c=>c.id!=='source-clip'&&c.at===4.5&&c.time[0]===5));
  const inserted=await call('timeline_insert_asset',{path:'assets/overlay.png',revision:split.revision,at:20,time:[0,3]});
  assert.ok(inserted.new_clip_id);
  const inspected=await call('timeline_get_clip',{clip:inserted.new_clip_id});
  assert.equal(inspected.clip.src,'assets/overlay.png');
  assert.equal(inspected.clip.at,20);
  const rejected=await request('tools/call',{name:'timeline_remove_clip',arguments:{clip:inserted.new_clip_id,revision:split.revision}});
  assert.equal(rejected.result.isError,true);
  const removed=await call('timeline_remove_clip',{clip:inserted.new_clip_id,revision:inserted.revision});
  assert.equal(removed.removed_clip_id,inserted.new_clip_id);
  const afterRemove=readFilmFile(await readFile(join(project,'film.html'),'utf8'));
  assert.ok(afterRemove.doc,afterRemove.problems.join('; '));
  assert.ok(!afterRemove.value.tracks.flatMap(t=>t.clips).some(c=>c.id===inserted.new_clip_id));
  assert.equal((await readFile(join(project,'assets','overlay.png'))).toString(),'asset retained outside timeline');
  const old=await request('tools/call',{name:'timeline_set_playback',arguments:{clip:'source-clip',revision:duplicated.revision,field:'volume',value:0.5}});
  assert.equal(old.result.isError,true);
 } finally {
  if(child){child.kill();child.stdin.destroy()}
  await rm(project,{recursive:true,force:true});
 }
});
