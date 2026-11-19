import test from 'node:test';
import assert from 'node:assert/strict';
import { propertyEdits, batchOps } from './mcp/timeline-actions.mjs';

test('MCP accepts bounded official Studio clip properties',()=>{
 const properties=propertyEdits([
  {clip:'intro',prop:'start',value:1.5},
  {clip:'intro',prop:'end',value:4},
  {clip:'intro',prop:'box',value:{x:30,y:40,w:640,h:360,r:10}},
  {clip:'intro',prop:'fade',value:[0.5,1]},
  {clip:'intro',prop:'motion',value:{rotate:[{t:0,v:0},{t:2,v:45,ease:'ease-out'}]}}
 ]);
 assert.equal(properties.length,5);
 assert.equal(properties[4].value.motion,undefined);
 for(const bad of [
  {clip:'intro',prop:'src',value:'../../private.txt'},
  {clip:'intro',prop:'style',value:'background:red'},
  {clip:'intro',prop:'box',value:{x:0,y:0,r:Infinity}},
  {clip:'intro',prop:'fade',value:[1,-1]},
  {clip:'intro',prop:'motion',value:{opacity:[{t:1,v:1.1}]}},
  {clip:'intro',prop:'motion',value:{rotate:[{t:0,v:0,ease:'invalid'}]}}
 ])assert.throws(()=>propertyEdits([bad]));
 assert.throws(()=>propertyEdits([]));
});
test('MCP batch normalizes approved operations only',async()=>{
 const ops=await batchOps([
  {op:'insert_asset',id:'opening',path:'assets/frame.png',at:2,time:[0,5]},
  {op:'props',edits:[{clip:'opening',prop:'fade',value:[0.5,0.5]}]},
  {op:'move',clip:'opening',at:6},
  {op:'track',track:0,field:'muted',value:true},
  {op:'stage',w:1080,h:1920}
 ],async path=>path);
 assert.equal(ops[0].op,'insert');
 assert.equal(ops[0].clip.id,'opening');
 assert.equal(ops[1].op,'props');
 assert.equal(ops[4].op,'stage');
 await assert.rejects(batchOps([{op:'fields',clip:'opening',fields:{src:'elsewhere'}}],async path=>path));
 await assert.rejects(batchOps([{op:'insert_asset',path:'source.mp4',at:0}],async()=>{throw Error('outside assets')}));
 await assert.rejects(batchOps([{op:'move',clip:'opening',at:-1}],async path=>path));
 await assert.rejects(batchOps([{op:'props',edits:[{clip:'opening',prop:'attrs',value:{}}]}],async path=>path));
});
