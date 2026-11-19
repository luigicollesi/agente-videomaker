import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('MCP reads canvas in compact pages and searches native library', {timeout:60000}, async()=>{
 const root=await mkdtemp(join(tmpdir(),'videomaker-mcp-discovery-'));
 const script=fileURLToPath(new URL('./media-mcp.mjs',import.meta.url));
 let child;
 try{
  await mkdir(join(root,'.film'));
  await writeFile(join(root,'film.html'),'<!doctype html><html><body></body></html>');
  const nodes=[
   {id:'note-a',x:0,y:0,text:'Opening shot with dramatic light'},
   {id:'note-b',x:100,y:0,text:'Second shot'}
  ];
  await writeFile(join(root,'.film','canvas.json'),JSON.stringify({nodes,edges:[{id:'edge-a',from:'note-a',to:'note-b'}]}));
  child=spawn(process.execPath,[script],{env:{...process.env,VIDEOMAKER_PROJECT:root},stdio:['pipe','pipe','pipe']});
  let buffer='',id=0;
  const pending=new Map();
  child.stdout.on('data',data=>{
   buffer+=data.toString();
   while(buffer.includes('\n')){
    const cut=buffer.indexOf('\n'),line=buffer.slice(0,cut);
    buffer=buffer.slice(cut+1);
    if(!line.trim())continue;
    const reply=JSON.parse(line),done=pending.get(reply.id);
    if(done){pending.delete(reply.id);done(reply)}
   }
  });
  child.on('error',error=>{for(const reject of pending.values())reject({error:String(error)})});
  const call=(name,args={})=>new Promise((resolve,reject)=>{
   const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('MCP timeout: '+name))},30000);
   pending.set(key,reply=>{clearTimeout(timer);resolve(reply)});
   child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:key,method:'tools/call',params:{name,arguments:args}})+'\n');
  });
  const ok=async(name,args={})=>{
   const reply=await call(name,args);
   assert.notEqual(reply.result?.isError,true,JSON.stringify(reply.result));
   return JSON.parse(reply.result.content[0].text);
  };
  const boards=await ok('canvas_list');
  assert.ok(boards.boards.some(b=>b.id==='main'));
  const page=await ok('canvas_nodes',{limit:1,offset:0});
  assert.equal(page.total,2);
  assert.equal(page.returned,1);
  assert.equal(page.next_offset,1);
  const next=await ok('canvas_nodes',{limit:1,offset:page.next_offset});
  assert.equal(next.returned,1);
  assert.equal(next.next_offset,null);
  const node=await ok('canvas_nodes',{node:'note-a'});
  assert.equal(node.node.text,nodes[0].text);
  assert.equal(node.edges.length,1);
  const missing=await call('canvas_nodes',{board:'missing'});
  assert.equal(missing.result.isError,true);
  const search=await ok('library_search',{kind:'effect',query:'glow',limit:3});
  assert.equal(search.kind,'effect');
  assert.ok(Array.isArray(search.results));
  assert.ok(search.results.length<=3);
  const invalid=await call('library_search',{kind:'invalid',query:'glow'});
  assert.equal(invalid.result.isError,true);
 }finally{
  if(child){child.kill();child.stdin.destroy()}
  await rm(root,{recursive:true,force:true});
 }
});
