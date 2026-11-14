import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {TextGeometry} from 'three/addons/geometries/TextGeometry.js';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import {createText3DCore} from './text3d-v2-core.mjs';
import {validateText3DInstance} from './text3d-v2-contract.mjs';

test('v2 core composes native and external motion with deterministic seeks',async()=>{
 const raw=JSON.parse(await readFile(new URL('../node_modules/three/examples/fonts/helvetiker_regular.typeface.json',import.meta.url),'utf8'));
 const font=new FontLoader().parse(raw);
 const calls=[];
 class FakeRenderer{
  isWebGLRenderer=true;
  setSize(){} setClearColor(){} render(){calls.push('render')} dispose(){calls.push('dispose')}
 }
 const adapter={...THREE,TextGeometry,WebGLRenderer:FakeRenderer};
 let disposed=0;
 const component=createText3DCore({THREE:adapter,canvas:{width:960,height:540},font,text:'A',
  native:[{evaluate(time,{model}){model.characters[0].position.y+=time}}], 
  appearance:[{evaluate(time,{materials}){materials[0].color.setRGB(time/10,0,0)},dispose(){disposed++}}]});
 assert.deepEqual(validateText3DInstance(component),[]);
 await component.frame(2);
 const first=component.model.characters[0].position.y;
 const firstColor=component.appearance.materials[0].color.r;
 await component.frame(1);
 await component.frame(2);
 assert.equal(component.model.characters[0].position.y,first);
 assert.equal(component.appearance.materials[0].color.r,firstColor);
 assert.equal(calls.filter(x=>x==='render').length,3);
 const originalRenderer=component.renderer;
 assert.throws(()=>createText3DCore({THREE:adapter,canvas:{width:960,height:540},font,text:'A',native:[{channels:['material.color'],evaluate(){}}],appearance:[{channels:['material.color'],evaluate(){}}]}),/Conflicting Text3D channel/);
 component.setText('ABC');
 assert.equal(component.renderer,originalRenderer);
 assert.equal(component.model.meshes.length,3);
 await component.frame(2);
 const newBaseline=component.model.root.position.x;
 await component.frame(1);
 await component.frame(2);
 assert.equal(component.model.root.position.x,newBaseline);
 component.dispose();component.dispose();
 assert.equal(disposed,1);
 assert.equal(calls.filter(x=>x==='dispose').length,1);
 await assert.rejects(component.frame(2),/disposed/);
});
