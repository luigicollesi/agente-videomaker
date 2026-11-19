import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PiMcpBridge, piMcpTools } from './pi-mcp-bridge.mjs';

test('embedded Pi discovers and calls exactly the same local MCP service without dumping all tool schemas',{
 timeout:30000
},async()=>{
 const root=await mkdtemp(join(tmpdir(),'videomaker-pi-bridge-'));
 const server=join(root,'server.mjs');
 const source=[
  'import {createInterface} from "node:readline";',
  'const rl=createInterface({input:process.stdin});',
  'rl.on("line",line=>{',
  ' const v=JSON.parse(line);let result;',
  ' if(v.method==="initialize")result={capabilities:{tools:{}}};',
  ' else if(v.method==="tools/list")result={tools:[',
  ' {name:"timeline_overview",description:"Read current timeline",inputSchema:{type:"object",properties:{}}},',
  ' {name:"music_context",description:"Read music interval",inputSchema:{type:"object",properties:{start:{type:"number"}}}}]};',
  ' else if(v.method==="tools/call")result={content:[{type:"text",text:JSON.stringify({name:v.params.name,args:v.params.arguments,project:process.env.VIDEOMAKER_PROJECT})}]};',
  ' process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:v.id,result})+"\\n");',
  '});'
 ].join('\n');
 await writeFile(server,source);
 const bridge=new PiMcpBridge({cwd:root,script:server,command:process.execPath});
 try{
  const tools=piMcpTools(bridge);
  assert.deepEqual(tools.map(t=>t.name),['videomaker_tools','videomaker_call']);
  const found=await bridge.discover('timeline',3);
  assert.equal(found.total,1);
  assert.equal(found.tools[0].name,'timeline_overview');
  assert.equal(found.tools[0].inputSchema,undefined,'category search should not fill context with tool schemas');
  const exact=await bridge.discover('timeline_overview',3);
  assert.equal(exact.schema_included,true);
  assert.equal(exact.tools[0].inputSchema.type,'object');
  assert.ok(Buffer.byteLength(JSON.stringify(found))<Buffer.byteLength(JSON.stringify(exact)),'category discovery must cost fewer bytes than full schema');

  const discovery=await tools[0].execute('tool-call-1',{query:'music',limit:3});
  assert.equal(JSON.parse(discovery.content[0].text).tools[0].name,'music_context');
  const output=await tools[1].execute('tool-call-2',{name:'timeline_overview',arguments:{}});
  const decoded=JSON.parse(output.content[0].text);
  assert.equal(decoded.name,'timeline_overview');
  assert.equal(decoded.project,root);
  // Reuse the existing subprocess; no duplicate engine startup or second provider.
  assert.equal(bridge.child?.pid>0,true);
  assert.equal((await bridge.discover('timeline_overview')).schema_included,true);

  await assert.rejects(bridge.call('unknown_tool',{}),/Unknown MCP tool/);
  await assert.rejects(bridge.discover('timeline',200),/Invalid MCP discovery/);
 }finally{bridge.close();await rm(root,{recursive:true,force:true})}
});
