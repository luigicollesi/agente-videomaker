// @ts-check
/** Text3D version registry. Logical names never replace immutable version IDs. */
import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { savedRoot } from '../../../src/locations.mjs';

/** @typedef {{source2DId:string,componentId:string,version:string,bundlePath:string,displayName:string,sourceRevision:string,parameterMap:Record<string,string>,status:'ready',active?:boolean}} RegistryEntry */

const REGISTRY = '.text3d-registry.json';
const ID = /^[a-z0-9][a-z0-9/_-]{0,159}$/i;
const VERSION = /^v[1-9][0-9]*$/;
const stableId=id=>String(id).replace(/\/v[1-9][0-9]*$/,'');
/** @param {any} entry @returns {entry is RegistryEntry} */
const supported = entry => entry && typeof entry === 'object' &&
  ID.test(entry.source2DId ?? '') && ID.test(entry.componentId ?? '') &&
  (entry.version===undefined||VERSION.test(entry.version)) && typeof entry.bundlePath === 'string' &&
  /^saved\/[a-z0-9][a-z0-9/_-]{0,200}$/i.test(entry.bundlePath) &&
  typeof entry.displayName === 'string' && entry.displayName.length <= 100 &&
  typeof entry.sourceRevision === 'string' && entry.sourceRevision.length <= 128 &&
  entry.status === 'ready' && entry.parameterMap && typeof entry.parameterMap === 'object' &&
  !Array.isArray(entry.parameterMap) && Object.entries(entry.parameterMap).every(([from,to])=>
    typeof from === 'string' && from.length > 0 && from.length <= 120 &&
    typeof to === 'string' && to.length > 0 && to.length <= 120);

/** @param {string|undefined} root */
const storagePath = root => join(root ?? savedRoot(), REGISTRY);
/** @param {string|undefined} root @returns {Promise<RegistryEntry[]>} */
async function read(root) {
 try {
  const doc = JSON.parse(await readFile(storagePath(root), 'utf8'));
  return Array.isArray(doc.entries) ? doc.entries.filter(supported) : [];
 } catch (error) {
  if (/** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT') return [];
  throw error;
 }
}
/** @param {string|undefined} root @param {RegistryEntry[]} entries */
async function write(root, entries) {
 const dest=storagePath(root);
 await mkdir(dirname(dest),{recursive:true});
 const temp=dest+'.'+randomUUID()+'.tmp';
 await writeFile(temp,JSON.stringify({version:1,entries},null,2)+'\n',{flag:'wx'});
 await rename(temp,dest);
}
/** A single active component per source; legacy version entries remain readable until replaced. */
/** @param {string|null} [source2DId] @param {string} [root] */
export async function listText3D(source2DId=null,root) {
 const entries=(await read(root)).filter(e=>source2DId==null||e.source2DId===source2DId);
 const latest=new Map();
 for(const e of entries){
  const id=stableId(e.componentId);
  const prev=latest.get(id);
  if(!prev||e.active&&!prev.active||(!e.active===!prev.active&&Number(e.version?.slice(1)??0)>Number(prev.version?.slice(1)??0)))
   latest.set(id,e);
 }
 return [...latest.values()].map(e=>({...e,componentId:stableId(e.componentId)}))
  .sort((a,b)=>a.source2DId.localeCompare(b.source2DId));
}
/** @param {string} source2DId @param {string} [root] */
export async function activeText3D(source2DId,root) {
 return (await listText3D(source2DId,root))[0]??null;
}
/** Atomically replace the registry pointer after the new bundle has passed verification. */
/** @param {RegistryEntry} input @param {string} [root] */
export async function registerText3D(input,root) {
 if(!supported(input)||stableId(input.componentId)!==input.componentId)
  throw new Error('Invalid versionless Text3D registry entry');
 const entries=await read(root);
 const next=entries.filter(e=>stableId(e.componentId)!==input.componentId&&e.source2DId!==input.source2DId);
 const updated={...input,active:true};
 delete updated.version;
 next.push(updated);
 await write(root,next);
 return updated;
}
/** @param {RegistryEntry} entry */
export function displayText3D(entry){return entry.displayName}
