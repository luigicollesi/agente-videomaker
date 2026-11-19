import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filmHtml } from '../../../packages/openfilm/src/film-doc.mjs';

test('native MCP film preview and safe one-second export', {
 skip:process.env.VIDEOMAKER_MCP_FILM_INTEGRATION!=='1'||process.platform!=='linux',
 timeout:180000
},async()=>{
 const root=await mkdtemp(join(tmpdir(),'videomaker-film-mcp-'));
 const script=fileURLToPath(new URL('./media-mcp.mjs',import.meta.url));
 let child;
 try{
  await mkdir(join(root,'assets'));
  const tinyPng='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBxoAAAAASUVORK5CYII=';
  await writeFile(join(root,'assets','frame.png'),Buffer.from(tinyPng,'base64'));
  await writeFile(join(root,'film.html'),filmHtml({stage:{w:320,h:180},tracks:[{clips:[{id:'test-frame',src:'assets/frame.png',at:0,time:[0,2]}]}]}));
  child=spawn(process.execPath,[script],{env:{...process.env,VIDEOMAKER_PROJECT:root},stdio:['pipe','pipe','pipe']});
  let buffer='',next=0;
  const pending=new Map();
  child.stdout.on('data',chunk=>{
   buffer+=chunk.toString();
   while(buffer.includes('\n')){
    const at=buffer.indexOf('\n'),line=buffer.slice(0,at);
    buffer=buffer.slice(at+1);
    if(!line.trim())continue;
    const reply=JSON.parse(line),done=pending.get(reply.id);
    if(done){pending.delete(reply.id);done(reply)}
   }
  });
  const request=(name,args={})=>new Promise((resolve,reject)=>{
   const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('MCP film timeout'))},150000);
   pending.set(id,reply=>{clearTimeout(timer);resolve(reply)});
   child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})+'\n');
  });
  const ok=async(name,args)=>{
   const response=await request(name,args);
   assert.notEqual(response.result?.isError,true,JSON.stringify(response.result));
   return response.result;
  };
  const overview=(await ok('timeline_overview')).content[0];
  const revision=JSON.parse(overview.text).revision;
  const preview=await ok('film_preview_frame',{at:0.5});
  assert.equal(JSON.parse(preview.content[0].text).status,'previewed');
  assert.ok(preview.content.some(p=>p.type==='image'));
  const rendered=await ok('film_render',{revision,output:'assets/result.mp4',start:0,end:1,fps:12});
  assert.equal(JSON.parse(rendered.content[0].text).status,'rendered');
  assert.ok((await stat(join(root,'assets','result.mp4'))).size>100);
  const original=await readFile(join(root,'assets','result.mp4'));
  const duplicate=await request('film_render',{revision,output:'assets/result.mp4',start:0,end:1,fps:12});
  assert.equal(duplicate.result.isError,true);
  assert.deepEqual(await readFile(join(root,'assets','result.mp4')),original);
 }finally{
  if(child){child.kill();child.stdin.destroy()}
  await rm(root,{recursive:true,force:true});
 }
});
