import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('MCP opt-in metrics expose only operation name, timing, size, and status',{timeout:20000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'videomaker-mcp-metrics-'));
 const server=fileURLToPath(new URL('./media-mcp.mjs',import.meta.url));
 let processMcp;
 try{
  processMcp=spawn(process.execPath,[server],{
   cwd:root,env:{...process.env,VIDEOMAKER_PROJECT:root,VIDEOMAKER_MCP_METRICS:'1'},
   stdio:['pipe','pipe','pipe']
  });
  let stdout='',stderr='';
  processMcp.stdout.on('data',data=>stdout+=data.toString());
  processMcp.stderr.on('data',data=>stderr+=data.toString());
  const reply=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('MCP metrics test timed out')),10000);
   processMcp.stdout.on('data',()=>{
    const line=stdout.split('\n').find(line=>line.trim());
    if(!line)return;
    clearTimeout(timer);
    try{resolve(JSON.parse(line))}catch(e){reject(e)}
   });
   processMcp.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{private_secret:'must-never-appear'}})+'\n');
  });
  assert.equal(reply.id,1);
  assert.ok(reply.result.tools.length>=40);
  await new Promise(resolve=>setTimeout(resolve,100));
  const metric=stderr.split('\n').filter(line=>line.startsWith('MCP_METRIC ')).map(line=>JSON.parse(line.slice(11)));
  assert.equal(metric.length,1);
  assert.equal(metric[0].method,'tools/list');
  assert.equal(metric[0].ok,true);
  assert.ok(metric[0].response_bytes>0);
  assert.ok(metric[0].elapsed_ms>=0);
  assert.ok(!stderr.includes('must-never-appear'));
 }finally{
  if(processMcp){processMcp.kill();processMcp.stdin.destroy()}
  await rm(root,{recursive:true,force:true});
 }
});
