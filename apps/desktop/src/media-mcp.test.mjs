import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
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
  assert.deepEqual(listed.result.tools.map(t=>t.name),['inspect_image','inspect_video','reverse_video']);
  const denied=await request(3,'tools/call',{name:'inspect_image',arguments:{path:'private.jpg'}});
  assert.equal(denied.result.isError,true);
  const reverseDenied=await request(4,'tools/call',{name:'reverse_video',arguments:{path:'private.jpg',output:'assets/out.mp4'}});
  assert.equal(reverseDenied.result.isError,true);
  const escapedOutput=await request(5,'tools/call',{name:'reverse_video',arguments:{path:'assets/nonexistent.mp4',output:'../escaped.mp4'}});
  assert.equal(escapedOutput.result.isError,true);
 } finally {
  if(child){child.kill();child.stdin.destroy()}
  await rm(project,{recursive:true,force:true});
 }
});
