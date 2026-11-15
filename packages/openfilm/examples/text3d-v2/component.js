import * as THREE from 'three';
import {TextGeometry} from 'three/addons/geometries/TextGeometry.js';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import {createText3DCore} from './openfilm-text3d-v2-core.mjs';
import manifest from './manifest.json' with {type:'json'};

const kinds=['native','motion','appearance','vfx'];
export async function createText3D({canvas,element,root}){
 const font=await new FontLoader().loadAsync(manifest.model.font);
 const factories={};
 for(const kind of kinds){
  factories[kind]=[];
  for(const path of manifest.modules[kind]){
   const module=await import(path);
   if(typeof module.createEffect!=='function')throw new Error('Missing createEffect: '+path);
   factories[kind].push(module.createEffect);
  }
 }
 const adapter={...THREE,TextGeometry};
 const modules={};
 for(const kind of kinds)modules[kind]=await Promise.all(factories[kind].map(create=>create()));
 const core=createText3DCore({THREE:adapter,canvas,font,text:element.textContent||' ',depth:manifest.model.depth,...modules});
 let previousColor='';
 return {
  get contractVersion(){return 2},
  get renderer(){return core.renderer},
  get scene(){return core.scene},
  get camera(){return core.camera},
  get model(){return core.model},
  get animations(){return core.animations},
  async frame(t){
   const text=element.textContent||' ';
   core.setText(text);
   core.resize(canvas.clientWidth||canvas.width,canvas.clientHeight||canvas.height);
   const css=getComputedStyle(root);
   const desiredDepth=parseFloat(css.getPropertyValue('--text3d-depth'));
   if(Number.isFinite(desiredDepth)&&desiredDepth>0)core.setDepth(desiredDepth);
   const length=parseFloat(css.getPropertyValue('--clip-length'));
   if(Number.isFinite(length)&&length>0)core.setDuration(length);
   const color=css.getPropertyValue('--text3d-color').trim()||'#dae9ff';
   if(color!==previousColor){core.setBaseColor(color);previousColor=color}
   await core.frame(t);
  },
  dispose(){core.dispose()}
 };
}
