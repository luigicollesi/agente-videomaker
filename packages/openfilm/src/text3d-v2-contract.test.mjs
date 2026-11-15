import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateText3D,validateText3DInstance} from './text3d-contract.mjs';

test('Text3D v2 sample has a valid declarative contract',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../examples/text3d/manifest.json',import.meta.url),'utf8'));
 assert.deepEqual(validateText3D(manifest),[]);
 assert.ok(validateText3D({...manifest,runtime:'svg'}) .includes('runtime must be three-webgl'));
 assert.ok(validateText3D({...manifest,model:{...manifest.model,font:'../../unsafe.json'}}).some(e=>e.includes('model.font')));
});

test('v2 runtime contract rejects fake 3D and accepts real Three-compatible instances',()=>{
 assert.ok(validateText3DInstance({renderer:{},model:{meshes:[]}}).length>0);
 const mock={
  contractVersion:2,renderer:{isWebGLRenderer:true},scene:{isScene:true},
  camera:{isCamera:true},
  model:{root:{isGroup:true},characters:[],meshes:[{isMesh:true,geometry:{isBufferGeometry:true}}]},
  animations:{native:[],motion:[],appearance:[],vfx:[]},
  frame(){},dispose(){}
 };
 assert.deepEqual(validateText3DInstance(mock),[]);
});
