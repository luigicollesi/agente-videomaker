import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createText3DMotion,text3DEnvelope,text3DGraphemes} from './text3d-runtime.mjs';
const point=(x=0,y=0,z=0)=>({x,y,z});
const object=()=>({position:point(),rotation:point(),scale:point(1,1,1)});
test('Text3D motion is absolute and works with time scrubbing',async()=>{
 const group=object(),characters=[object(),object()];
 const runtime=createText3DMotion({group,characters,events:[
  {id:'spin',target:'group',type:'rotate',start:1,duration:2,from:[0,0,0],to:[0,90,0]},
  {id:'chars',target:'characters',type:'translate',start:2,duration:1,stagger:.5,from:[0,0,0],to:[0,0,10]}
 ]});
 await runtime.frame(4);const original=JSON.stringify({group,characters});
 await runtime.frame(1);
 await runtime.frame(4);
 assert.equal(JSON.stringify({group,characters}),original);
 assert.ok(Math.abs(group.rotation.y-Math.PI/2)<1e-8);
 assert.equal(characters[0].position.z,10);
 assert.equal(characters[1].position.z,10);
 await runtime.frame(2.25);
 assert.equal(characters[1].position.z,0);
 assert.equal(characters[0].position.z,2.5);
});
test('entrance and exit respect effective timeline clip length',()=>{
 assert.equal(text3DEnvelope(-1,6,1,2),0);
 assert.equal(text3DEnvelope(0,6,1,2),0);
 assert.equal(text3DEnvelope(3,6,1,2),1);
 assert.equal(text3DEnvelope(6,6,1,2),0);
 assert.equal(text3DEnvelope(5.5,6,1,2)<1,true);
});
test('characters split by grapheme clusters',()=>{
 assert.deepEqual(text3DGraphemes('ÁB'),['Á','B']);
});
test('invalid motion configurations are rejected',()=>{
 assert.throws(()=>createText3DMotion({group:object(),characters:[],events:[{id:'x',target:'group',type:'rotate',start:0,duration:1,from:[0,0,0],to:[0,0,0]},{id:'x',target:'group',type:'rotate',start:0,duration:1,from:[0,0,0],to:[0,0,0]}]}));
});
