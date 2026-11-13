// @ts-check
/** Text3D version registry. Logical names never replace immutable version IDs. */
import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { savedRoot } from '../../src/locations.mjs';

const REGISTRY = '.text3d-registry.json';
const ID = /^[a-z0-9][a-z0-9/_-]{0,159}$/i;
const VERSION = /^v[1-9][0-9]*$/;
const supported = entry => entry && typeof entry === 'object' &&
  ID.test(entry.source2DId ?? '') && ID.test(entry.componentId ?? '') &&
  VERSION.test(entry.version ?? '') && typeof entry.bundlePath === 'string' &&
  /^saved\/[a-z0-9][a-z0-9/_-]{0,200}$/i.test(entry.bundlePath) &&
  typeof entry.displayName === 'string' && entry.displayName.length <= 100 &&
  typeof entry.sourceRevision === 'string' && entry.sourceRevision.length <= 128 &&
  entry.status === 'ready';

const storagePath = root => join(root ?? savedRoot(), REGISTRY);
async function read(root) {
 try {
  const doc = JSON.parse(await readFile(storagePath(root), 'utf8'));
  return Array.isArray(doc.entries) ? doc.entries.filter(supported) : [];
 } catch (error) {
  if (error?.code === 'ENOENT') return [];
  throw error;
 }
}
async function write(root, entries) {
 const dest=storagePath(root);
 await mkdir(dirname(dest),{recursive:true});
 const temp=dest+'.'+randomUUID()+'.tmp';
 await writeFile(temp,JSON.stringify({version:1,entries},null,2)+'\n',{flag:'wx'});
 await rename(temp,dest);
}
/** List exact source matches, active first. Never infer identity from display names. */
export async function listText3D(source2DId=null,root) {
 const entries=await read(root);
 return entries.filter(e=>source2DId==null||e.source2DId===source2DId)
   .sort((a,b)=>a.source2DId.localeCompare(b.source2DId)||Number(b.version.slice(1))-Number(a.version.slice(1)));
}
export async function activeText3D(source2DId,root) {
 return (await listText3D(source2DId,root)).find(e=>e.active===true)??null;
}
/** Register a validated component, promote it atomically, and retain earlier versions. */
export async function registerText3D(input,root) {
 if(!supported(input))throw new Error('Invalid Text3D registry entry');
 const entries=await read(root);
 const own=entries.filter(e=>e.source2DId===input.source2DId);
 const expected=Math.max(0,...own.map(e=>Number(e.version.slice(1))))+1;
 if(input.version!==`v${expected}`)throw new Error('Text3D versions must increase monotonically');
 if(entries.some(e=>e.componentId===input.componentId))throw new Error('Text3D component ID already exists');
 const next=entries.map(e=>e.source2DId===input.source2DId?{...e,active:false}:e);
 next.push({source2DId:input.source2DId,componentId:input.componentId,version:input.version,bundlePath:input.bundlePath,displayName:input.displayName,sourceRevision:input.sourceRevision,status:'ready',active:true});
 await write(root,next);
 return next.at(-1);
}
/** The display-only name for archived versions, without changing immutable IDs. */
export function displayText3D(entry) {
 return entry.active ? entry.displayName : `${entry.displayName} — old_${entry.version}`;
}
