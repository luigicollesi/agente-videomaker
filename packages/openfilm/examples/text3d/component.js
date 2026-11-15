import * as THREE from 'three';
import {TextGeometry} from 'three/addons/geometries/TextGeometry.js';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import {TTFLoader} from 'three/addons/loaders/TTFLoader.js';
import {createText3DCore} from './openfilm-text3d-core.mjs';
import manifest from './manifest.json' with {type:'json'};

const kinds=['native','motion','appearance','vfx'];
export async function createText3D({canvas,element,root}){
 const loader=new FontLoader();
 const ttfLoader=new TTFLoader();
 const loadFont=async file=>file.toLowerCase().endsWith('.ttf')?loader.parse(await ttfLoader.loadAsync(file)):loader.loadAsync(file);
 const font=await loadFont(manifest.model.font);
 const fonts=new Map([['default',font]]);
 const faces=manifest.typography?.fonts??{};
 const resolveFont=async family=>{
  const name=String(family||'default').trim().replace(/^['"]|['"]$/g,'');
  if(name==='default'||name===manifest.typography?.defaultFamily)return font;
  if(!Object.hasOwn(faces,name))throw Error('Text3D font is not bundled: '+name);
  const file=faces[name];
  if(typeof file!=='string'||!/^\.\/assets\/[a-z0-9_./-]+\.(json|ttf)$/i.test(file)||file.split('/').includes('..'))throw Error('Invalid bundled Text3D font path');
  if(!fonts.has(name))fonts.set(name,await loadFont(file));
  return fonts.get(name);
 };
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
 let lastFamily='',lastSize='',lastSpacing='',lastAlign='';
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
   const family=css.getPropertyValue('--text3d-font').trim().replace(/^['"]|['"]$/g,'')||'default';
   const size=css.getPropertyValue('--text3d-size').trim();
   const spacing=css.getPropertyValue('--text3d-spacing').trim();
   const align=css.getPropertyValue('--text3d-align').trim()||'center';
   if(family!==lastFamily||size!==lastSize||spacing!==lastSpacing||align!==lastAlign){
    const selected=await resolveFont(family);
    core.setTypography({font:selected,...(size?{fontSize:Number(size)}:{}),...(spacing?{letterSpacing:Number(spacing)}:{}),textAlign:align});
    lastFamily=family;lastSize=size;lastSpacing=spacing;lastAlign=align;
   }
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
