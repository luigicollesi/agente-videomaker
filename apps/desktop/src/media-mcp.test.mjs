import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('Media MCP lists native tools and denies paths outside assets', async () => {
 const project=await mkdtemp(join(tmpdir(),'videomaker-mcp-test-'));
 const script=fileURLToPath(new URL('./media-mcp.mjs',import.meta.url));
 let child;
 try {
  await mkdir(join(project,'assets'));
  await writeFile(join(project,'private.jpg'),Buffer.from('private'));
  await writeFile(join(project,'assets','sample.mp4'),Buffer.from('fixture'));
  await writeFile(join(project,'assets','existing.mp4'),Buffer.from('existing'));
  if(process.platform!=='win32'){
   await symlink(join(project,'private.jpg'),join(project,'assets','linked.mp4'));
   await symlink(project,join(project,'assets','escape-dir'),'dir');
  }
  child=spawn(process.execPath,[script],{env:{...process.env,VIDEOMAKER_PROJECT:project},stdio:['pipe','pipe','pipe']});
  let buf='',pending=new Map();
  child.stdout.on('data',data=>{
   buf+=data.toString();
   while(buf.includes('\n')){
    const cut=buf.indexOf('\n'),line=buf.slice(0,cut);buf=buf.slice(cut+1);
    if(!line.trim())continue;
    const reply=JSON.parse(line);
    const handler=pending.get(reply.id);if(handler){pending.delete(reply.id);handler(reply)}
   }
  });
  const request=(id,method,params={})=>new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('MCP timeout')),5000);
   pending.set(id,result=>{clearTimeout(timeout);resolve(result)});
   child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
  });
  const init=await request(1,'initialize',{});
  assert.equal(init.result.serverInfo.name,'videomaker-media');
  const listed=await request(2,'tools/list');
  assert.deepEqual(listed.result.tools.map(t=>t.name),["inspect_image","inspect_video","library_search","canvas_list","canvas_apply","canvas_nodes","library_take","timeline_get_clip","timeline_insert_asset","timeline_remove_clip","film_preview_frame","film_render","timeline_overview","timeline_split_clip","timeline_set_playback","timeline_duplicate_clip","timeline_move_clip","timeline_clips","text3d_list","text3d_inspect","text3d_create","text3d_validate","music_inspect","music_validate","music_compare","music_analyze","music_overview","music_context","music_cues","reverse_video"]);
  const denied=await request(3,'tools/call',{name:'inspect_image',arguments:{path:'private.jpg'}});
  assert.equal(denied.result.isError,true);
  const reverseDenied=await request(4,'tools/call',{name:'reverse_video',arguments:{path:'private.jpg',output:'assets/out.mp4'}});
  assert.equal(reverseDenied.result.isError,true);
  const escapedOutput=await request(5,'tools/call',{name:'reverse_video',arguments:{path:'assets/sample.mp4',output:'../escaped.mp4'}});
  assert.equal(escapedOutput.result.isError,true);
  const existing=await request(16,'tools/call',{name:'reverse_video',arguments:{path:'assets/sample.mp4',output:'assets/existing.mp4'}});
  assert.equal(existing.result.isError,true);
  if(process.platform!=='win32'){
   const linked=await request(17,'tools/call',{name:'reverse_video',arguments:{path:'assets/sample.mp4',output:'assets/linked.mp4'}});
   assert.equal(linked.result.isError,true);
   const parentEscape=await request(19,'tools/call',{name:'reverse_video',arguments:{path:'assets/sample.mp4',output:'assets/escape-dir/escaped.mp4'}});
   assert.equal(parentEscape.result.isError,true);
  }
  const escapedMusic=await request(18,'tools/call',{name:'music_analyze',arguments:{path:'assets/sample.mp4',output:'../music.json'}});
  assert.equal(escapedMusic.result.isError,true);
  const badAudio=await request(6,'tools/call',{name:'reverse_video',arguments:{path:'assets/sample.mp4',output:'assets/new.mp4',audio:'invalid'}});
  assert.equal(badAudio.result.isError,true);
  const noFilm=await request(9,'tools/call',{name:'timeline_overview',arguments:{}});
  assert.equal(noFilm.result.isError,true);
  const badMove=await request(10,'tools/call',{name:'timeline_move_clip',arguments:{clip:'missing',at:-1,revision:'invalid'}});
  assert.equal(badMove.result.isError,true);
  const badDuplicate=await request(11,'tools/call',{name:'timeline_duplicate_clip',arguments:{clip:'missing',at:0,revision:'0000000000000000'}});
  assert.equal(badDuplicate.result.isError,true);
  const badSpeed=await request(12,'tools/call',{name:'timeline_set_playback',arguments:{clip:'missing',revision:'0000000000000000',field:'speed',value:0}});
  assert.equal(badSpeed.result.isError,true);
  const staleVolume=await request(13,'tools/call',{name:'timeline_set_playback',arguments:{clip:'missing',revision:'0000000000000000',field:'volume',value:1}});
  assert.equal(staleVolume.result.isError,true);
  const invalidSplit=await request(14,'tools/call',{name:'timeline_split_clip',arguments:{clip:'x',revision:'0000000000000000',at:5,left_time:[0,5],right_time:[6,10]}});
  assert.equal(invalidSplit.result.isError,true);
  const missingSplit=await request(15,'tools/call',{name:'timeline_split_clip',arguments:{clip:'x',revision:'0000000000000000',at:5,left_time:[0,5],right_time:[5,10]}});
  assert.equal(missingSplit.result.isError,true);
  const badMusicSource=await request(7,'tools/call',{name:'music_analyze',arguments:{path:'private.jpg',output:'assets/analysis.json'}});
  assert.equal(badMusicSource.result.isError,true);
  const invalidInterval=await request(8,'tools/call',{name:'music_cues',arguments:{path:'assets/sample.mp4',start:10,end:2}});
  assert.equal(invalidInterval.result.isError,true);
 } finally {
  if(child){child.kill();child.stdin.destroy()}
  await rm(project,{recursive:true,force:true});
 }
});
