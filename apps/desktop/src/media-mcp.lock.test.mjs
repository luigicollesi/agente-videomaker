import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, chmod, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function startMcp(script,project,python){
 const child=spawn(process.execPath,[script],{env:{...process.env,VIDEOMAKER_PROJECT:project,VIDEOMAKER_PYTHON:python},stdio:['pipe','pipe','pipe']});
 let buffer='',requestId=0;
 const pending=new Map();
 child.stdout.on('data',data=>{
  buffer+=data.toString();
  while(buffer.includes('\n')){
   const point=buffer.indexOf('\n'),line=buffer.slice(0,point);buffer=buffer.slice(point+1);
   if(!line.trim())continue;
   const reply=JSON.parse(line),done=pending.get(reply.id);
   if(done){pending.delete(reply.id);done(reply)}
  }
 });
 function call(name,args){
  return new Promise((resolve,reject)=>{
   const id=++requestId,timer=setTimeout(()=>{pending.delete(id);reject(Error('MCP request timed out'))},15000);
   pending.set(id,reply=>{clearTimeout(timer);resolve(reply)});
   child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})+'\n');
  });
 }
 return {child,call};
}
async function waitUntilFile(file){
 for(let n=0;n<100;n++){
  try{await access(file);return}catch{await new Promise(resolve=>setTimeout(resolve,20))}
 }
 throw Error('Lock never acquired');
}
test('Media MCP denies heavy operations across two server instances', {skip:process.platform==='win32'?'POSIX executable fixture':false},async()=>{
 const project=await mkdtemp(join(tmpdir(),'videomaker-mcp-lock-'));
 const script=fileURLToPath(new URL('./media-mcp.mjs',import.meta.url));
 const python=join(project,'fake-python');
 let a,b;
 try{
  await mkdir(join(project,'assets'));
  await writeFile(join(project,'assets','source.wav'),'fake audio');
  await writeFile(python,`#!/usr/bin/env node
const fs=require('node:fs');
const path=require('node:path');
const args=process.argv.slice(2);
if(args.includes('analyze')){
 const output=args[args.indexOf('--output')+1];
 setTimeout(()=>{fs.writeFileSync(output,'{}');console.log('{"status":"analyzed"}')},900);
}else if(args.includes('validate'))console.log('{"valid":true}');
else console.log('{}');
`);
  await chmod(python,0o755);
  a=startMcp(script,project,python);
  b=startMcp(script,project,python);
  const first=a.call('music_analyze',{path:'assets/source.wav',output:'assets/one.json'});
  const lock=join(project,'.videomaker-mcp-heavy.lock');
  await waitUntilFile(lock);
  const locked=await b.call('music_analyze',{path:'assets/source.wav',output:'assets/two.json'});
  assert.equal(locked.result.isError,true);
  assert.match(locked.result.content[0].text,/Another MCP instance/);
  const result=await first;
  assert.notEqual(result.result.isError,true,JSON.stringify(result.result));
  assert.equal((await readFile(join(project,'assets','one.json'),'utf8')),'{}');
  const retry=await b.call('music_analyze',{path:'assets/source.wav',output:'assets/two.json'});
  assert.notEqual(retry.result.isError,true,JSON.stringify(retry.result));
  assert.equal((await readFile(join(project,'assets','two.json'),'utf8')),'{}');
 }finally{
  for(const server of [a,b])if(server){server.child.kill();server.child.stdin.destroy()}
  await rm(project,{recursive:true,force:true});
 }
});
