// @ts-check
/** Publish reusable Text3D components from a folder into Saved and the single active registry. */
import { cp, copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { savedRoot } from './locations.mjs';
import { installedFontFile } from '../studio/server/fonts.mjs';
import { verifyText3D } from './text3d-verify.mjs';
import { validateText3D as validateText3DManifest } from './text3d-contract.mjs';
import { builtInRoot } from '../studio/server/library.mjs';
import { replacementEdits } from './text3d-replace.mjs';
import { readProjectFilm, editProjectFilm } from '../studio/server/film.mjs';
import { takeSaved } from '../studio/server/saved.mjs';
import { activeText3D, listText3D, registerText3D } from '../studio/server/text3d/registry.mjs';

/** @param {unknown} value */
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
/** Resolve a manifest asset without allowing absolute paths, traversal or symlink escapes. */
async function safeAsset(base,name){
 if(typeof name!=='string'||!/^\.\/[a-z0-9_./-]+$/i.test(name)||name.split('/').includes('..'))throw new Error('Unsafe Text3D asset path: '+name);
 const path=resolve(base,name),rel=relative(base,path);
 if(!rel||rel.startsWith('..'+sep)||rel==='..'||rel.startsWith(sep))throw new Error('Text3D asset escapes package: '+name);
 const file=await stat(path).catch(()=>null);
 if(!file?.isFile())throw new Error('Missing Text3D asset: '+name);
 return path;
}
/** @param {string} dir */
async function validateText3D(dir) {
 const base=resolve(dir);
 const manifest=JSON.parse(await readFile(join(base,'manifest.json'),'utf8'));
 if(manifest?.contractVersion===2){
  const issues=validateText3DManifest(manifest);
  if(issues.length)throw new Error('Text3D contract: '+issues.join('; '));
  for(const kind of ['native','motion','appearance','vfx'])for(const file of manifest.modules[kind])await safeAsset(base,file);
  await safeAsset(base,manifest.model.font);
  for(const file of Object.values(manifest.typography?.fonts??{}))await safeAsset(base,file);
 }
 else throw new Error('Legacy Text3D formats are not supported');
 const fields=['id','source2DId'];
 for(const field of fields)if(typeof manifest[field]!=='string'||!manifest[field])
  throw new Error('Text3D manifest is missing '+field);
 if(!record(manifest.parameterMap))throw new Error('Text3D requires parameterMap');
 if(!Array.isArray(manifest.props))throw new Error('Text3D requires editable props');
 if(!manifest.props.some(p=>record(p)&&p.type==='text'))
  throw new Error('Text3D must expose editable text');
 
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
 if(/\bSVGRenderer\b/.test(code))
  throw new Error('Text3D requires Three.js WebGLRenderer; SVGRenderer fallback is not allowed');
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
 const usage='videomaker text3d create <folder> | font-add <folder> <family> | preview <folder> | list [source-id] | inspect <source-id> | validate <folder> | register <folder> | apply <project-folder> <clip-id> <component-id>';
 try {
  if(action==='create'&&rest.length===1){
   const target=resolve(rest[0]);
   await cp(new URL('../examples/text3d/',import.meta.url),target,{recursive:true,errorOnExist:true,force:false});
   await mkdir(join(target,'assets'),{recursive:true});
   await copyFile(new URL(import.meta.resolve('three/examples/fonts/helvetiker_regular.typeface.json')),join(target,'assets/font.json'));
   return {ok:true,lines:['Text3D draft created: '+target]};
  }
  if(action==='font-add'&&rest.length===2){
   const folder=resolve(rest[0]),family=rest[1].trim();
   if(!family||family.length>100)throw Error('Invalid font family');
   const source=await installedFontFile([family]);
   if(!source||!source.path.toLowerCase().endsWith('.ttf'))throw Error('No installed TrueType face available for '+family);
   const manifest=await validateText3D(folder);
   const target=join(folder,'assets','system-font-'+(await import('node:crypto')).createHash('sha256').update(source.path).digest('hex').slice(0,16)+'.ttf');
   await mkdir(dirname(target),{recursive:true});
   await copyFile(source.path,target);
   manifest.typography??={defaultFamily:'default',fonts:{}};
   manifest.typography.fonts??={};
   manifest.typography.fonts[source.name]='./assets/'+target.split(sep).at(-1);
   await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
   return {ok:true,lines:['Bundled installed TrueType font: '+source.name,'Face: '+manifest.typography.fonts[source.name]]};
  }
  if(action==='list'||action==='inspect'){
   const entries=action==='inspect'?[await activeText3D(rest[0]??'')].filter(Boolean):await listText3D(rest[0]??null);
   return {ok:true,lines:[JSON.stringify(entries,null,2)]};
  }
  if(action==='apply'&&rest.length===3){
   const [folder,clipId,componentId]=rest;
   const project=resolve(folder);
   const entry=(await listText3D()).find(e=>e.componentId===componentId);
   if(!entry)throw new Error('Registered Text3D component not found');
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
   // Confirm the imported page and bundled assets render at the project's actual path.
   await verifyText3D(join(project,dirname(taken.clip.src)),Number(clip.time?.[1]??10));
   const edits=replacementEdits(clip,taken.clip,entry.parameterMap);
   await editProjectFilm(project,rev,[{op:'props',edits}]);
   return {ok:true,lines:['Applied '+entry.componentId+' to clip '+clipId]};
  }
  if(action==='validate'&&rest[0]){
   const manifest=await validateText3D(rest[0]);
   return {ok:true,lines:['Text3D structure validated: '+(manifest.id),'Run register for packaged visual verification.']};
  }
  if((action==='register'||action==='preview')&&rest.length===1){
   const source=resolve(rest[0]),manifest=await validateText3D(source);
   const id=String(manifest.componentId??manifest.id);
   const sourceId=String(manifest.source2DId);
   if(!/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/i.test(sourceId))throw new Error('Unsafe Text3D source identifier');
   const pathParts=id.split('/');
   if(pathParts.some(p=>!p||!/^[a-z0-9][a-z0-9_-]*$/i.test(p))||pathParts.length<2||/^v[1-9][0-9]*$/.test(pathParts.at(-1)))
    throw new Error('Unsafe Text3D component identifier');
   const folder=join(savedRoot(),'text3d',...pathParts);
   const relative='text3d/'+pathParts.join('/');
   const parent=join(savedRoot(),'text3d');
   await mkdir(parent,{recursive:true});
   const staging=await mkdtemp(join(parent,'.staging-'));
   let publishedFolder='',publishedRelative='';
   try{
    const files=join(staging,'files');
    await cp(source,files,{recursive:true,errorOnExist:true,force:false});
    await copyFile(new URL('./text3d-runtime.mjs',import.meta.url),join(files,'openfilm-text3d-runtime.mjs'));
    {
     await copyFile(new URL('./text3d-core.mjs',import.meta.url),join(files,'openfilm-text3d-core.mjs'));
     await copyFile(new URL('./text3d-resource-manager.mjs',import.meta.url),join(files,'text3d-resource-manager.mjs'));
     await copyFile(new URL('./text3d-animation-composer.mjs',import.meta.url),join(files,'text3d-animation-composer.mjs'));
     await copyFile(new URL('./text3d-runtime.mjs',import.meta.url),join(files,'text3d-runtime.mjs'));
    }
    const moduleMain=new URL(import.meta.resolve('three'));
    const vendorFiles=[
      [moduleMain, 'three.module.js'],
      [new URL('./three.core.js',moduleMain),'three.core.js'],
      [new URL(import.meta.resolve('three/addons/geometries/TextGeometry.js')),'geometries/TextGeometry.js'],
      [new URL(import.meta.resolve('three/addons/loaders/FontLoader.js')),'loaders/FontLoader.js'],
      [new URL(import.meta.resolve('three/addons/loaders/TTFLoader.js')),'loaders/TTFLoader.js'],
      [new URL(import.meta.resolve('three/addons/libs/opentype.module.js')),'libs/opentype.module.js'],
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
    if(!/<\/head>/i.test(oldHtml) || /type=['"]importmap['"]/i.test(oldHtml))
      throw new Error('index.html requires a </head> and must not define another import map');
    const importMap='<script type="importmap">'+JSON.stringify({imports:{
      three:'./vendor/three.module.js',
      'three/addons/':'./vendor/'
    }})+'</script>';
    await writeFile(indexPath,oldHtml.replace(/<\/head>/i,importMap+'</head>'));
    const duration=Number(manifest.durationSeconds);
    const seconds=Number.isFinite(duration)&&duration>0&&duration<=3600?duration:10.5;
    const clip={src:'index.html',time:[0,seconds],attrs:{
      'data-openfilm-content-type':'text3d','data-text3d-source-id':sourceId,
      'data-props':JSON.stringify(manifest.props)
    }};
    await writeFile(join(staging,'saved.json'),JSON.stringify({version:2,kind:'clip',clip,durationMs:seconds*1000},null,2));
    // Preserve the exact 2D library poster in the immutable 3D Saved bundle.
    const original=sourceId.startsWith('saved/')
      ? join(savedRoot(),...sourceId.slice('saved/'.length).split('/'))
      : join(builtInRoot(),...sourceId.split('/'));
    for(const ext of ['jpg','svg']){
      const cover=join(original,'poster.'+ext);
      if((await stat(cover).catch(()=>null))?.isFile()){
        await copyFile(cover,join(staging,'poster.'+ext));
        break;
      }
    }
    // Ensure local module imports still resolve after the bundle is relocated.
    for(const [fileName, sourceCode] of [['component.js',await readFile(join(files,'component.js'),'utf8')]]){
      for(const [,relative] of sourceCode.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.[^'"]+)['"]/g)){
        if(!relative)continue;
        const dependency=resolve(files,relative);
        if(!dependency.startsWith(files+sep)||!(await stat(dependency).catch(()=>null))?.isFile())
          throw new Error('Missing packaged Text3D dependency in '+fileName+': '+relative);
      }
    }
    // Only the packaged copy is authoritative; verify its imports and actual pixels.
    await verifyText3D(files,seconds);
    if(action==='preview'){
     const previewDir=source+'-preview';
     if(await stat(previewDir).catch(()=>null))throw new Error('Preview folder already exists: '+previewDir);
     await rename(staging,previewDir);
     return {ok:true,lines:['Verified packaged Text3D preview: '+join(previewDir,'files','index.html'),'This preview is not registered or applied.']};
    }
    await mkdir(join(folder,'..'),{recursive:true});
    // Publish the verified build to a unique directory; never overwrite a referenced bundle.
    const uniqueFolder=folder+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
    await rename(staging,uniqueFolder);
    publishedFolder=uniqueFolder;
    publishedRelative=relative+'-'+uniqueFolder.split('-').at(-2)+'-'+uniqueFolder.split('-').at(-1);
   }catch(error){await rm(staging,{recursive:true,force:true});throw error}
   const entry={source2DId:sourceId,componentId:id,bundlePath:'saved/'+publishedRelative,
     displayName:String(manifest.displayName??manifest.id),sourceRevision:String(manifest.sourceRevision??'current'),
     parameterMap:manifest.parameterMap,status:'ready',active:true};
   // Stable IDs: registry points only to the verified active bundle.
   try{
    const saved=await registerText3D(/** @type {any} */ (entry));
    return {ok:true,lines:['Text3D registered: '+saved.componentId, 'Library: '+saved.bundlePath]};
   }catch(error){if(publishedFolder)await rm(publishedFolder,{recursive:true,force:true});throw error}
  }
  return {ok:false,usage:true,lines:[usage]};
 }catch(error){return {ok:false,lines:[error instanceof Error?error.message:String(error)]}}
}
