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
  ' if(v.method==="hang")return;',
  ' if(v.method==="initialize")result={capabilities:{tools:{}}};',
  ' else if(v.method==="tools/list")result={tools:[',
  ' {name:"timeline_overview",description:"Read current timeline",inputSchema:{type:"object",properties:{revision:{type:"string",description:"Revision identifier returned by the film editing engine"},track:{type:"integer",description:"Index of track to inspect"},offset:{type:"integer",description:"Pagination offset"},limit:{type:"integer",description:"Maximum paginated entries"}}}},',
  ' {name:"music_context",description:"Read music interval",inputSchema:{type:"object",properties:{start:{type:"number"}}}},',
  ' {name:"inspect_video",description:"Inspect timestamped video frames",inputSchema:{type:"object"}}]};',
  ' else if(v.method==="tools/call")result=v.params.name==="inspect_video"?{content:[{type:"text",text:JSON.stringify({args:v.params.arguments})}]}:v.params.name==="timeline_overview"&&v.params.arguments?.overflow?{content:Array.from({length:6},(_,i)=>({type:"text",text:String(i)}))}:{content:[{type:"text",text:JSON.stringify({name:v.params.name,args:v.params.arguments,project:process.env.VIDEOMAKER_PROJECT})}]};',
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
  assert.equal(found.next_offset,null);
  assert.equal(found.remaining,0);
  const invalidOffsets=[-1,1.5,Number.MAX_SAFE_INTEGER+1];
  for(const offset of invalidOffsets)await assert.rejects(bridge.discover('timeline',3,offset),/Invalid MCP discovery/);
  const originalCatalog=bridge.catalog;
  const generated=Array.from({length:15},(_,i)=>({
   name:'timeline_extra_'+String(i).padStart(2,'0'),
   description:'Timeline operation '+i,
   inputSchema:{type:'object',properties:{index:{type:'integer'}}}
  }));
  for(const tool of generated)originalCatalog.set(tool.name,tool);
  const all=[];let offset=0;
  do{
   const page=await tools[0].execute('discovery-page',{query:'timeline',limit:6,offset});
   const parsed=JSON.parse(page.content[0].text);
   assert.equal(parsed.total,16);
   assert.ok(parsed.tools.every(x=>x.inputSchema===undefined));
   all.push(...parsed.tools.map(x=>x.name));
   offset=parsed.next_offset;
   if(offset!==null)assert.equal(parsed.remaining,16-offset);
  }while(offset!==null);
  assert.equal(new Set(all).size,16);
  assert.ok(all.includes('timeline_extra_14'));
  assert.equal((await bridge.discover('timeline',6,99)).remaining,0);
  assert.equal((await bridge.discover('timeline',6,99)).next_offset,null);
  for(const tool of generated)originalCatalog.delete(tool.name);
  const exact=await bridge.discover('timeline_overview',3);
  assert.equal(exact.schema_included,true);
  assert.equal(exact.tools[0].inputSchema.type,'object');
  assert.ok(Buffer.byteLength(JSON.stringify(found))<Buffer.byteLength(JSON.stringify(exact)),'category discovery must cost fewer bytes than full schema');

  const discovery=await tools[0].execute('tool-call-1',{query:'music',limit:3});
  assert.equal(JSON.parse(discovery.content[0].text).tools[0].name,'music_context');
  const output=await tools[1].execute('tool-call-2',{name:'timeline_overview',arguments:{}});
  const frames=await bridge.call('inspect_video',{path:'assets/example.mp4',max_frames:12,frame_offset:4});
  assert.deepEqual(JSON.parse(frames.content[0].text).args,{path:'assets/example.mp4',max_frames:12,frame_offset:4,frame_limit:2});
  const explicitlySized=await bridge.call('inspect_video',{path:'assets/example.mp4',frame_limit:1});
  assert.equal(JSON.parse(explicitlySized.content[0].text).args.frame_limit,1);
  await assert.rejects(bridge.call('timeline_overview',{overflow:true}),/more than 5 content blocks/);
  const decoded=JSON.parse(output.content[0].text);
  assert.equal(decoded.name,'timeline_overview');
  assert.equal(decoded.project,root);
  // Reuse the existing subprocess; no duplicate engine startup or second provider.
  assert.equal(bridge.child?.pid>0,true);
  assert.equal((await bridge.discover('timeline_overview')).schema_included,true);

  await assert.rejects(bridge.call('unknown_tool',{}),/Unknown MCP tool/);
  await assert.rejects(bridge.discover('timeline',200),/Invalid MCP discovery/);
  const initialPid=bridge.child.pid;
  await assert.rejects(bridge.request('hang',{},100),/timed out/);
  const restarted=await bridge.discover('timeline');
  assert.equal(restarted.tools.length,1);
  assert.notEqual(bridge.child.pid,initialPid);

 }finally{bridge.close();await rm(root,{recursive:true,force:true})}
});
