/**
 * Opt-in Object3D page bundle for Studio's EXISTING film-page clip pipeline.
 * Creates no timeline entries or editor overlays; insertion is a separate operation.
 */
import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export async function createObject3DDemo(folder){
  if(typeof folder!=='string'||!folder.trim())throw Error('Object3D demo folder required');
  const target=resolve(folder);
  if(await stat(target).catch(e=>{if(e?.code==='ENOENT')return null;throw e}))
    throw Error('Object3D demo target already exists');
  const parent=dirname(target);
  if(!(await stat(parent).catch(()=>null))?.isDirectory())throw Error('Object3D demo parent directory does not exist');
  await mkdir(target);
  try{
    const vendor=join(target,'vendor');
    await mkdir(vendor);
    await copyFile(new URL('../examples/object3d/index.html',import.meta.url),join(target,'index.html'));
    await copyFile(new URL('./object3d-scene.mjs',import.meta.url),join(target,'object3d-scene.mjs'));
    await copyFile(new URL('./object3d-camera.mjs',import.meta.url),join(target,'object3d-camera.mjs'));
    const three=new URL(import.meta.resolve('three'));
    await copyFile(three,join(vendor,'three.module.js'));
    await copyFile(new URL('./three.core.js',three),join(vendor,'three.core.js'));
    return {folder:target,page:join(target,'index.html'),durationSeconds:8,inserted:false};
  }catch(error){
    // The caller-selected target did not exist before this invocation.
    await rm(target,{recursive:true,force:true});
    throw error;
  }
}
