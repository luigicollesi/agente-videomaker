import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateText3DAnimations,applyText3DContributions,validateText3DContribution} from './text3d-animation-composer.mjs';
const vector=()=>({x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z}});
test('native and external transforms combine deterministically',async()=>{
 const mods={native:[{evaluate:t=>({transforms:[{target:'character:0',property:'position',op:'add',value:[0,t,0]}]})}],motion:[{evaluate:t=>({transforms:[{target:'character:0',property:'position',op:'add',value:[t,0,0]}]})}]};
 const commands=await evaluateText3DAnimations(mods,3,()=>({}));
 const state=()=>({root:{position:vector()},characters:[{position:vector()}],materials:[],lights:[]});
 const a=state();applyText3DContributions(commands,a);
 const b=state();applyText3DContributions(await evaluateText3DAnimations(mods,1,()=>({})),b);
 const c=state();applyText3DContributions(commands,c);
 assert.deepEqual([a.characters[0].position.x,a.characters[0].position.y],[3,3]);
 assert.deepEqual([c.characters[0].position.x,c.characters[0].position.y],[3,3]);
 assert.deepEqual([b.characters[0].position.x,b.characters[0].position.y],[1,1]);
});
test('conflicting setters and invalid values fail closed',()=>{
 const state={root:{},characters:[],materials:[{opacity:1}],lights:[]};
 assert.throws(()=>applyText3DContributions([
  {type:'materials',owner:'one',target:'material:0',property:'opacity',op:'set',value:.5},
  {type:'materials',owner:'two',target:'material:0',property:'opacity',op:'set',value:.2}
 ],state),/Conflicting/);
 assert.equal(state.materials[0].opacity,1);
 assert.throws(()=>validateText3DContribution({geometry:[]},'bad'),/unsupported contribution type/);
 assert.throws(()=>validateText3DContribution({materials:[{target:'material:0',property:'opacity',value:Infinity}]},'bad'),/invalid contribution value/);
});
