/** Optimistic, project-scoped edits of HTML pages already linked from the film.
 * This edits source text only: executing/rendering the page remains the native look engine's job.
 */
import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep, extname, dirname, basename, join } from 'node:path';
import { readProjectFilm } from 'openfilm/studio-film';
import { kindOf } from 'openfilm/film-doc';

const MAX_FILE=256*1024;
const hash=s=>createHash('sha256').update(s).digest('hex');
const inside=(root,path)=>{
 const rel=relative(root,path);
 return !!rel&&rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel);
};
const validHash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);

export function applyPageReplacements(text,changes){
 if(!Array.isArray(changes)||changes.length<1||changes.length>8)throw Error('Expected 1 to 8 exact replacements');
 let updated=text;
 for(const change of changes){
  if(!change||typeof change.find!=='string'||!change.find||change.find.length>24000||
     typeof change.replace!=='string'||change.replace.length>32000)throw Error('Invalid procedural page edit');
  const first=updated.indexOf(change.find);
  if(first<0||updated.indexOf(change.find,first+change.find.length)>=0)throw Error('Each replacement must match exactly once');
  updated=updated.slice(0,first)+change.replace+updated.slice(first+change.find.length);
  if(Buffer.byteLength(updated)>MAX_FILE)throw Error('Updated procedural page exceeds 256 KB');
 }
 if(!updated.trim())throw Error('Cannot publish an empty page');
 return updated;
}
export async function projectPage(project,args={}){
 if(typeof args.path!=='string'||!args.path||args.path.length>260||
    !['inspect','replace'].includes(args.action))throw Error('Invalid procedural page request');
 if(args.action==='replace'&&(!validHash(args.expected_sha256)||!Array.isArray(args.changes)))
  throw Error('A valid expected_sha256 and replacement list are required');
 const film=await readProjectFilm(project);
 if(!film.value)throw Error('Cannot edit a page without a valid film.html');
 const root=await realpath(project),lexical=resolve(root,args.path);
 if(extname(lexical).toLowerCase()!=='.html'||!inside(root,lexical)||basename(lexical)==='film.html'||
    args.path.split(/[\/\\]/).some(piece=>piece==='.film'||piece==='..'))throw Error('Only linked procedural pages within the project are allowed');
 const canonical=await realpath(lexical);
 if(canonical!==lexical||!inside(root,canonical)||(await stat(canonical)).size>MAX_FILE)throw Error('Page must be a regular local HTML file up to 256 KB');
 const links=film.value.tracks.flatMap((track,index)=>(track.clips??[]).filter(c=>
  kindOf(c)==='page'&&resolve(root,String(c.src??'').split('#')[0].split('?')[0])===canonical
 ).map(c=>({clip:c.id,track:index,locked:!!track.locked})));
 if(!links.length)throw Error('Only pages referenced by film.html can be edited');
 const original=await readFile(canonical,'utf8');
 const digest=hash(original);
 if(args.action==='inspect')return {path:relative(root,canonical).split(sep).join('/'),sha256:digest,bytes:Buffer.byteLength(original),clips:links};
 if(links.some(link=>link.locked))throw Error('A linked clip is on a locked track');
 if(digest!==args.expected_sha256)throw Error('Page changed; inspect it again before editing');
 const next=applyPageReplacements(original,args.changes);
 if(next===original)return {status:'unchanged',path:relative(root,canonical),sha256:digest};
 // Prepare a private sibling, then replace by rename only if the original is still unchanged.
 const temporary=join(dirname(canonical),'.videomaker-page-'+randomUUID()+'.tmp');
 let handle;
 try{
  handle=await open(temporary,'wx',0o600);
  await handle.writeFile(next);
  await handle.close();handle=null;
  if(hash(await readFile(canonical,'utf8'))!==digest)throw Error('Page changed during editing; retry with new hash');
  await rename(temporary,canonical);
 }finally{
  if(handle)await handle.close().catch(()=>{});
  await rm(temporary,{force:true}).catch(()=>{});
 }
 return {status:'updated',path:relative(root,canonical).split(sep).join('/'),sha256:hash(next),bytes:Buffer.byteLength(next),clips:links.length,next:'Use film_audit and film_preview_range to validate the visible result'};
}
