/** Object3D asset registry: installed GLB files and native procedural library items. */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { OBJECT3D_BUILTIN, OBJECT3D_BUILTIN_ID } from './object3d-built-in.mjs';
const ID=/^[a-z0-9][a-z0-9_-]{0,63}$/;
export async function listObject3D(root=join(import.meta.dirname,'../library/object3d')){
  const base=resolve(root);
  const names=await readdir(base).catch(e=>{if(e.code==='ENOENT')return [];throw e});
  const out=[];
  for(const name of names.sort()){
    if(!ID.test(name))continue;
    const dir=join(base,name);
    const rel=relative(base,dir);
    if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))continue;
    try{
      const info=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));
      if(info.id!==name||typeof info.name!=='string'||!info.name.trim()||info.format!=='glb')continue;
      const asset=join(dir,'model.glb');
      if(!(await stat(asset)).isFile())continue;
      out.push({id:name,name:info.name,description:typeof info.description==='string'?info.description:'',category:'object3d',parts:Array.isArray(info.parts)?info.parts.filter(x=>typeof x==='string'):[],materials:Array.isArray(info.materials)?info.materials.filter(x=>typeof x==='string'):[],path:asset});
    }catch(e){if(e.code!=='ENOENT'&&e.code!=='ENOTDIR'&&!(e instanceof SyntaxError))throw e}
  }
  return out;
}
export async function inspectObject3D(id,root){
  if(typeof id!=='string'||!ID.test(id))throw Error('Invalid Object3D asset ID');
  const item=(await listObject3D(root)).find(x=>x.id===id);
  if(!item)throw Error('Object3D asset is not installed');
  return item;
}
/** Discover native procedural objects and installed GLBs through the same agent API. */
export async function listObject3DAvailable(){
 return [OBJECT3D_BUILTIN,...await listObject3D()];
}
export async function inspectObject3DAvailable(id){
 if(id===OBJECT3D_BUILTIN_ID)return OBJECT3D_BUILTIN;
 return inspectObject3D(id);
}
export async function object3DCommand(args){
  const [action,id]=args;
  if(action==='list')return {ok:true,lines:[JSON.stringify(await listObject3DAvailable())]};
  if(action==='take'&&args.length===3){
    const project=resolve(args[1]),assetId=args[2];
    if(assetId!==OBJECT3D_BUILTIN_ID)throw Error('Unknown built-in Object3D asset');
    if(!(await stat(join(project,'film.html')).catch(()=>null))?.isFile())throw Error('Object3D take requires a film.html project');
    const {takeSaved}=await import('../studio/server/saved.mjs');
    const taken=await takeSaved(project,'openfilm/'+assetId);
    if(!('clip' in taken))throw Error('Object3D asset did not produce a clip');
    return {ok:true,lines:[JSON.stringify({status:'imported',asset:assetId,path:taken.clip.src,inserted:false,next:'Use timeline_overview and timeline_insert_asset with the current revision'})]};
  }
  if(action==='demo'&&id&&args.length===2){
    const {createObject3DDemo}=await import('./object3d-demo.mjs');
    const result=await createObject3DDemo(id);
    return {ok:true,lines:[JSON.stringify(result)]};
  }
  if(action==='inspect'&&id)return {ok:true,lines:[JSON.stringify(await inspectObject3DAvailable(id))]};
  if(action==='orbit'){
    const {orbitCameraKeyframes}=await import('./object3d-camera.mjs');
    const [radius,duration,startAzimuth='0',endAzimuth='360',elevation='15']=args.slice(1);
    if([radius,duration].some(x=>x===undefined))return {ok:false,usage:true,lines:['Usage: videomaker object3d orbit <radius> <duration> [startAzimuth] [endAzimuth] [elevation]']};
    const frames=orbitCameraKeyframes({radius:Number(radius),duration:Number(duration),startAzimuth:Number(startAzimuth),endAzimuth:Number(endAzimuth),elevation:Number(elevation)});
    return {ok:true,lines:[JSON.stringify({status:'planned',applied:false,keyframes:frames})]};
  }
  return {ok:false,usage:true,lines:['Usage: videomaker object3d list | inspect <asset-id> | take <project-folder> object3d/cube | demo <new-folder> | orbit <radius> <duration> [startAzimuth] [endAzimuth] [elevation]']};
}
