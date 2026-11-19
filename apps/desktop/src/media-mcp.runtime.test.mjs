import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('Media MCP honors Python override and limits subprocess output', {skip:process.platform==='win32'?'POSIX executable fixture':false}, async()=>{
 const project=await mkdtemp(join(tmpdir(),'videomaker-mcp-runtime-'));
 const script=fileURLToPath(new URL('./media-mcp.mjs',import.meta.url));
 const python=join(project,'fake-python');
 let child;
 try{
  await mkdir(join(project,'assets'));
  await writeFile(join(project,'assets','music.json'),'{}');
  await writeFile(python,[
   '#!/usr/bin/env node',
   'if(process.argv.includes("context")) process.stdout.write("x".repeat(5*1024*1024));',
   'else if(process.argv.includes("validate")) {console.log(JSON.stringify({valid:false,errors:["bad timestamps"]}));process.exitCode=2;}',
   'else console.log(JSON.stringify({interpreter:"configured"}));',
   ''
  ].join('\n'));
  await chmod(python,0o755);
  child=spawn(process.execPath,[script],{env:{...process.env,VIDEOMAKER_PROJECT:project,VIDEOMAKER_PYTHON:python},stdio:['pipe','pipe','pipe']});
  let buffer='',next=0;
  const pending=new Map();
  child.stdout.on('data',data=>{
   buffer+=data.toString();
   while(buffer.includes('\n')){
    const index=buffer.indexOf('\n'),line=buffer.slice(0,index);buffer=buffer.slice(index+1);
    if(!line.trim())continue;
    const reply=JSON.parse(line),complete=pending.get(reply.id);
    if(complete){pending.delete(reply.id);complete(reply)}
   }
  });
  const request=(name,args={})=>new Promise((resolve,reject)=>{
   const id=++next;
   const timer=setTimeout(()=>{pending.delete(id);reject(Error('MCP timeout'))},10000);
   pending.set(id,reply=>{clearTimeout(timer);resolve(reply)});
   child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})+'\n');
  });
  const overview=await request('music_overview',{path:'assets/music.json'});
  assert.notEqual(overview.result?.isError,true,JSON.stringify(overview.result));
  assert.equal(JSON.parse(overview.result.content[0].text).interpreter,'configured');
  const tooLarge=await request('music_context',{path:'assets/music.json',start:0,end:1});
  assert.equal(tooLarge.result?.isError,true);
  assert.match(tooLarge.result.content[0].text,/output exceeded limit/);
  const comparison=await request('music_compare',{path:'assets/music.json',start_a:0,end_a:1,start_b:2,end_b:3});
  assert.notEqual(comparison.result?.isError,true,JSON.stringify(comparison.result));
  const badCompare=await request('music_compare',{path:'assets/music.json',start_a:2,end_a:1,start_b:2,end_b:3});
  assert.equal(badCompare.result.isError,true);
  const validation=await request('music_validate',{path:'assets/music.json'});
  assert.notEqual(validation.result?.isError,true,JSON.stringify(validation.result));
  assert.equal(JSON.parse(validation.result.content[0].text).valid,false);
  const after=await request('music_overview',{path:'assets/music.json'});
  assert.notEqual(after.result?.isError,true,JSON.stringify(after.result));
 }finally{
  if(child){child.kill();child.stdin.destroy()}
  await rm(project,{recursive:true,force:true});
 }
});
