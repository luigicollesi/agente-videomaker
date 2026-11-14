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
 let core,previousText='',previousColor='';
 async function rebuild(text){
  core?.dispose();
  const modules={};
  for(const kind of kinds)modules[kind]=await Promise.all(factories[kind].map(create=>create()));
  core=createText3DCore({THREE:adapter,canvas,font,text,depth:manifest.model.depth,
   ...modules});
  previousText=text;
  previousColor='';
 }
 await rebuild(element.textContent||' ');
 return {
  get contractVersion(){return 2},
  get renderer(){return core.renderer},
  get scene(){return core.scene},
  get camera(){return core.camera},
  get model(){return core.model},
  get animations(){return core.animations},
  async frame(t){
   const text=element.textContent||' ';
   if(text!==previousText)await rebuild(text);
   const color=getComputedStyle(root).getPropertyValue('--text3d-color').trim()||'#dae9ff';
   if(color!==previousColor){core.setBaseColor(color);previousColor=color}
   await core.frame(t);
  },
  dispose(){core?.dispose()}
 };
}
