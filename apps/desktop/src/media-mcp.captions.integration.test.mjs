import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filmHtml } from '../../../packages/openfilm/src/film-doc.mjs';

test('MCP reads film captions and style without terminal or Studio', {timeout:30000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'videomaker-mcp-captions-'));
 let child;
 try{
  await mkdir(join(root,'assets'));
  await writeFile(join(root,'assets','still.png'),Buffer.from('png'));
  await writeFile(join(root,'film.html'),filmHtml({stage:{w:640,h:360},tracks:[{clips:[{id:'still-a',src:'assets/still.png',at:0,time:[0,2]}]}]}));
  const script=fileURLToPath(new URL('./media-mcp.mjs',import.meta.url));
  child=spawn(process.execPath,[script],{env:{...process.env,VIDEOMAKER_PROJECT:root},stdio:['pipe','pipe','pipe']});
  let buffer='',next=0;
  const pending=new Map();
  child.stdout.on('data',chunk=>{
   buffer+=chunk.toString();
   while(buffer.includes('\n')){
    const index=buffer.indexOf('\n'),line=buffer.slice(0,index);buffer=buffer.slice(index+1);
    if(!line.trim())continue;
    const reply=JSON.parse(line),resolve=pending.get(reply.id);
    if(resolve){pending.delete(reply.id);resolve(reply)}
   }
  });
  const request=(name,args={})=>new Promise((resolve,reject)=>{
   const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('MCP caption test timeout'))},12000);
   pending.set(id,message=>{clearTimeout(timer);resolve(message)});
   child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})+'\n');
  });
  const ok=async(name,args={})=>{
   const result=await request(name,args);
   assert.equal(result.result?.isError,false,JSON.stringify(result));
   return JSON.parse(result.result.content[0].text);
  };
  const page=await ok('captions_list',{start:0,end:2,limit:5});
  assert.equal(page.total,0);
  assert.equal(page.next_offset,null);
  assert.match(page.revision,/^[a-f0-9]{16}$/);
  const style=await ok('captions_style',{action:'get'});
  assert.equal(typeof style.style.font.weight,'number');
  assert.match(style.style_revision,/^[a-f0-9]{16}$/);
  const staleStyle=await request('captions_style',{action:'patch',style_revision:'0000000000000000',changes:{fill:'#fff'}});
  assert.equal(staleStyle.result.isError,true);
  const invalidCorrection=await request('captions_correct_line',{revision:page.revision,src:'assets/still.png',line:-1,text:'new',expected_text:'old'});
  assert.equal(invalidCorrection.result.isError,true);
 }finally{
  if(child){child.kill();child.stdin.destroy()}
  await rm(root,{recursive:true,force:true});
 }
});
