// @ts-check
/** Publish reusable Text3D components from a folder into Saved and the immutable-version registry. */
import { cp, copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { savedRoot } from './locations.mjs';
import { replacementEdits } from './text3d-replace.mjs';
import { readProjectFilm, editProjectFilm } from '../studio/server/film.mjs';
import { takeSaved } from '../studio/server/saved.mjs';
import { activeText3D, listText3D, registerText3D } from '../studio/server/text3d/registry.mjs';

/** @param {unknown} value */
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
/** @param {string} dir */
async function validateText3D(dir) {
 const base=resolve(dir);
 const manifest=JSON.parse(await readFile(join(base,'manifest.json'),'utf8'));
 if(!record(manifest)||manifest.formatVersion!==1||manifest.runtimeVersion!==1)
  throw new Error('Text3D manifest requires formatVersion=1 and runtimeVersion=1');
 const fields=['componentId','source2DId','sourceRevision','displayName','version'];
 for(const field of fields)if(typeof manifest[field]!=='string'||!manifest[field])
  throw new Error('Text3D manifest is missing '+field);
 if(!record(manifest.parameterMap))throw new Error('Text3D requires parameterMap');
 if(!Array.isArray(manifest.props))throw new Error('Text3D requires editable props');
 if(!manifest.props.some(p=>record(p)&&p.type==='text'))
  throw new Error('Text3D must expose editable text');
 if(!record(manifest.capabilities)||manifest.capabilities.characters!==true||manifest.capabilities.group!==true)
  throw new Error('Text3D must support per-character and group motion');
 const html=await readFile(join(base,'index.html'),'utf8');
 const code=await readFile(join(base,'component.js'),'utf8');
 if(!/window\.film\s*=/.test(html)||!/frameReadsOverrides\s*:\s*true/.test(html))
  throw new Error('index.html must expose frameReadsOverrides to the OpenFilm player');
 if(!html.includes('--clip-length'))throw new Error('index.html must respect --clip-length');
 if(/\b(?:duration\s*:\s*\d+|window\.film\.duration)\b/.test(html))
  throw new Error('Do not set native page duration');
 if(/<iframe\b/i.test(html)||/https?:\/\//i.test(html+code))
  throw new Error('Text3D pages cannot embed frames or fetch external network resources');
 if(!/createText3D/.test(code))throw new Error('component.js must export createText3D');
 let count=0,total=0;
 /** @param {string} dir @param {number} depth */
 const walk=async(dir,depth)=>{
  if(depth>8)throw new Error('Too many dependency levels');
  for(const entry of await readdir(dir,{withFileTypes:true})){
   if(entry.name.startsWith('.')||entry.name==='node_modules')throw new Error('Hidden and dependency folders are not allowed');
   const path=join(dir,entry.name);
   if(entry.isSymbolicLink())throw new Error('Symlinks are not allowed');
   if(entry.isDirectory()){await walk(path,depth+1);continue}
   if(!entry.isFile())throw new Error('Only regular files are allowed');
   count++;total+=(await stat(path)).size;
   if(count>150||total>12*1024*1024)throw new Error('Text3D package exceeds size limits');
  }
 };
 await walk(base,0);
 return manifest;
}
/** @param {string[]} args */
export async function text3DCommand(args) {
 const [action, ...rest]=args;
 const usage='openfilm text3d list [source-id] | inspect <source-id> | validate <folder> | register <folder> | apply <project-folder> <clip-id> <component-id>';
 try {
  if(action==='list'||action==='inspect'){
   const entries=action==='inspect'?[await activeText3D(rest[0]??'')].filter(Boolean):await listText3D(rest[0]??null);
   return {ok:true,lines:[JSON.stringify(entries,null,2)]};
  }
  if(action==='apply'&&rest.length===3){
   const [folder,clipId,componentId]=rest;
   const project=resolve(folder);
   const entry=(await listText3D()).find(e=>e.componentId===componentId);
   if(!entry)throw new Error('Registered Text3D version not found');
   const {rev,value}=await readProjectFilm(project);
   const clip=value?.tracks.flatMap(t=>t.clips).find(c=>c.id===clipId);
   if(!clip)throw new Error('Selected clip was not found');
   if(clip.attrs?.['data-openfilm-content-type']==='text3d')throw new Error('Clip is already a Text3D component');
   // Plan and validate against the original Saved bundle BEFORE copying anything into the project.
   const library=join(savedRoot(),entry.bundlePath.slice('saved/'.length));
   const manifest=JSON.parse(await readFile(join(library,'saved.json'),'utf8'));
   if(manifest.kind!=='clip'||!manifest.clip)throw new Error('Registered Saved bundle is invalid');
   replacementEdits(clip,{...manifest.clip,src:'text3d-placeholder.html'},entry.parameterMap);
   const taken=await takeSaved(project,entry.bundlePath);
   if(!('clip' in taken))throw new Error('Cannot import the saved Text3D component');
   const edits=replacementEdits(clip,taken.clip,entry.parameterMap);
   await editProjectFilm(project,rev,[{op:'props',edits}]);
   return {ok:true,lines:['Applied '+entry.componentId+' to clip '+clipId]};
  }
  if(action==='validate'&&rest[0]){
   const manifest=await validateText3D(rest[0]);
   return {ok:true,lines:['Text3D structure validated: '+manifest.componentId]};
  }
  if(action==='register'&&rest[0]){
   const source=resolve(rest[0]),manifest=await validateText3D(source);
   const id=String(manifest.componentId);
   const sourceId=String(manifest.source2DId);
   const version=String(manifest.version);
   const pathParts=id.split('/');
   if(pathParts.some(p=>!p||!/[a-z0-9][a-z0-9_-]*/i.test(p)))
    throw new Error('Unsafe Text3D component identifier');
   const folder=join(savedRoot(),'text3d',...pathParts);
   const relative='text3d/'+pathParts.join('/');
   const parent=join(savedRoot(),'text3d');
   await mkdir(parent,{recursive:true});
   const staging=await mkdtemp(join(parent,'.staging-'));
   try{
    const files=join(staging,'files');
    await cp(source,files,{recursive:true,errorOnExist:true,force:false});
    await copyFile(new URL('./text3d-runtime.mjs',import.meta.url),join(files,'openfilm-text3d-runtime.mjs'));
    const moduleMain=new URL(import.meta.resolve('three'));
    const vendorFiles=[
      [moduleMain, 'three.module.js'],
      [new URL('./three.core.js',moduleMain),'three.core.js'],
      [new URL(import.meta.resolve('three/addons/geometries/TextGeometry.js')),'geometries/TextGeometry.js'],
      [new URL(import.meta.resolve('three/addons/loaders/FontLoader.js')),'loaders/FontLoader.js'],
      [new URL(import.meta.resolve('three/examples/fonts/helvetiker_regular.typeface.json')),'fonts/helvetiker_regular.typeface.json'],
      [new URL('../LICENSE',moduleMain),'LICENSE.txt']
    ];
    for(const [url,path] of vendorFiles){
      const dest=join(files,'vendor',path);
      await mkdir(dirname(dest),{recursive:true});
      await copyFile(url,dest);
    }
    const indexPath=join(files,'index.html');
    const oldHtml=await readFile(indexPath,'utf8');
    if(!/<\\/head>/i.test(oldHtml) || /type=['"]importmap['"]/i.test(oldHtml))
      throw new Error('index.html requires a </head> and must not define another import map');
    const importMap='<script type="importmap">'+JSON.stringify({imports:{
      three:'./vendor/three.module.js',
      'three/addons/':'./vendor/'
    }})+'</script>';
    await writeFile(indexPath,oldHtml.replace(/<\\/head>/i,importMap+'</head>'));
    const duration=Number(manifest.durationSeconds);
    const seconds=Number.isFinite(duration)&&duration>0&&duration<=3600?duration:10.5;
    const clip={src:'index.html',time:[0,seconds],attrs:{
      'data-openfilm-content-type':'text3d','data-text3d-source-id':sourceId,
      'data-text3d-version':version,'data-props':JSON.stringify(manifest.props)
    }};
    await writeFile(join(staging,'saved.json'),JSON.stringify({version:2,kind:'clip',clip,durationMs:seconds*1000},null,2));
    await mkdir(join(folder,'..'),{recursive:true});
    await rename(staging,folder);
   }catch(error){await rm(staging,{recursive:true,force:true});throw error}
   const entry={source2DId:sourceId,componentId:id,version,bundlePath:'saved/'+relative,
     displayName:String(manifest.displayName),sourceRevision:String(manifest.sourceRevision),
     parameterMap:manifest.parameterMap,status:'ready',active:true};
   // The bundle is never overwritten, even if another version is promoted.
   try{
    const saved=await registerText3D(/** @type {any} */ (entry));
    return {ok:true,lines:['Text3D registered: '+saved.componentId, 'Library: '+saved.bundlePath]};
   }catch(error){await rm(folder,{recursive:true,force:true});throw error}
  }
  return {ok:false,usage:true,lines:[usage]};
 }catch(error){return {ok:false,lines:[error instanceof Error?error.message:String(error)]}}
}
