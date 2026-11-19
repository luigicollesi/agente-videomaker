/** Text3D MCP draft isolation and preview provenance. Does not execute component code. */
import { createHash } from 'node:crypto';
import { join, resolve, dirname, relative, isAbsolute, sep, basename } from 'node:path';
import { realpath, stat, lstat, readdir, readFile, writeFile } from 'node:fs/promises';

const within=(base,path)=>{const r=relative(base,path);return !!r&&r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r)};
const DRAFT_NAME=/^[a-z][a-z0-9_-]{0,49}$/;
const PROOF_FILE='.mcp-source-sha256';
export function validDraftName(name){return typeof name==='string'&&DRAFT_NAME.test(name)}
export async function draftPath(project,raw){
 if(typeof raw!=='string'||!raw.trim())throw Error('Missing Text3D draft folder');
 const root=await realpath(project);
 const base=await realpath(join(root,'.film','text3d-drafts'));
 if(!within(root,base))throw Error('Text3D draft root escapes project');
 const target=await realpath(resolve(project,raw));
 if(dirname(target)!==base||!validDraftName(basename(target))||!(await stat(target)).isDirectory())
  throw Error('Text3D draft must be a direct child of .film/text3d-drafts');
 return target;
}
/** SHA256 of relative names and file bytes; fail closed for links/oversized directories. */
export async function draftFingerprint(folder){
 const hash=createHash('sha256');
 let files=0,bytes=0;
 async function traverse(path,prefix){
  for(const entry of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   if(entry.isSymbolicLink())throw Error('Text3D draft cannot contain symbolic links');
   const rel=prefix?prefix+'/'+entry.name:entry.name;
   if(entry.isDirectory()){await traverse(join(path,entry.name),rel);continue}
   if(!entry.isFile())throw Error('Text3D draft contains unsupported entry');
   if(++files>500)throw Error('Text3D draft exceeds 500 files');
   const statInfo=await lstat(join(path,entry.name));
   bytes+=statInfo.size;
   if(bytes>40*1024*1024)throw Error('Text3D draft exceeds 40 MB');
   const data=await readFile(join(path,entry.name));
   hash.update(rel+'\0');
   hash.update(data);
  }
 }
 await traverse(folder,'');
 return hash.digest('hex');
}
/** Stamp a successful packaged and rendered preview; source changes invalidate the stamp. */
export async function recordPreview(folder){
 const preview=folder+'-preview';
 const actual=await realpath(preview);
 if(actual!==preview||!(await stat(join(actual,'files','index.html'))).isFile())throw Error('Text3D packaged preview missing');
 const digest=await draftFingerprint(folder);
 await writeFile(join(preview,PROOF_FILE),digest+'\n',{flag:'wx',mode:0o600});
 return digest;
}
export async function requireVerifiedPreview(folder){
 const preview=folder+'-preview';
 const actual=await realpath(preview);
 if(actual!==preview||!(await stat(join(actual,'files','index.html'))).isFile())throw Error('Packaged Text3D preview not found');
 let stored;
 try{stored=(await readFile(join(actual,PROOF_FILE),'utf8')).trim()}catch{throw Error('Run text3d_preview before registering the draft')}
 const current=await draftFingerprint(folder);
 if(stored!==current)throw Error('Text3D draft changed after preview; create and inspect a fresh preview');
 return current;
}
