/** Isolated native film preview/render worker. The parent MCP owns input validation, timeouts and publishing. */
import { resolve, join, relative, isAbsolute, sep, extname } from 'node:path';
import { realpath, mkdir, stat, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';

async function main(){
 const job=JSON.parse(process.argv[2]??'null');
 if(!job||!['look','look-range','render','text3d-preview','text3d-command'].includes(job.kind)||typeof job.root!=='string')throw Error('Invalid film worker request');
 const root=resolve(job.root);
 process.chdir(root);
 let result;
 if(job.kind==='text3d-command'){
  if(!Array.isArray(job.args)||!['font-add','register','apply'].includes(job.args[0])||job.args.length>4)
   throw Error('Unsupported Text3D action');
  if(job.args[0]==='register'){
   const { requireVerifiedPreview }=await import('./mcp/text3d-safety.mjs');
   await requireVerifiedPreview(job.args[1]);
  }
  const {text3DCommand}=await import('openfilm/text3d-cli');
  const done=await text3DCommand(job.args,job.args[0]==='apply'?{expectedRevision:job.revision}:{});
  if(!done.ok)throw Error((done.lines??[]).slice(0,4).join(' ').slice(0,900)||'Text3D command failed');
  result={action:job.args[0],revision:done.revision??null,lines:(done.lines??[]).slice(0,4)};
 }else if(job.kind==='text3d-preview'){
  const {text3DCommand}=await import('openfilm/text3d-cli');
  const done=await text3DCommand(['preview',job.source]);
  if(!done.ok)throw Error((done.lines??[]).slice(0,5).join(' ').slice(0,900)||'Text3D preview failed');
  result={preview:job.source+'-preview/files/index.html',lines:(done.lines??[]).slice(0,5)};
 }else if(job.kind==='look-range'){
  if(!Number.isFinite(job.start)||!Number.isFinite(job.end)||job.start<0||job.end<=job.start||
     !Number.isInteger(job.count)||job.count<2||job.count>12)throw Error('Invalid preview range');
  const {look}=await import('openfilm/look');
  const preview=await look(['.',String(job.start)+'-'+String(job.end)],{root,count:job.count,offline:true,network:false});
  if(!preview.ok)throw Error((preview.lines??[]).slice(0,5).join(' ').slice(0,1000)||'Contact sheet failed');
  result={files:(preview.files??[]).slice(0,2),lines:(preview.lines??[]).slice(0,12)};
 }else if(job.kind==='look'){
  const {look}=await import('openfilm/look');
  result=await look(['.',String(job.at)],{root,count:1,offline:true,network:false});
  if(!result.ok)throw Error((result.lines??[]).slice(0,5).join(' ').slice(0,1000)||'Film preview failed');
  result={files:(result.files??[]).slice(0,2),lines:(result.lines??[]).slice(0,12)};
 }else{
  const {render}=await import('openfilm/render');
  const times=job.range?[job.range.join('-')]:[];
  result=await render(['.',...times],{root,out:job.out,fps:job.fps,workers:1,hardware:false});
  result={out:result.out,encoder:result.encoder,lines:(result.lines??[]).slice(0,8)};
 }
 // Native look may save its files in an application data folder. Publish verified
 // PNG previews under the active project's hidden tool cache so the MCP can inspect them.
 if(['look','look-range'].includes(job.kind)&&Array.isArray(result.files)){
  const realRoot=await realpath(root);
  const state=join(realRoot,'.film');
  await mkdir(state,{recursive:true});
  if(await realpath(state)!==state)throw Error('Project .film must be local');
  const folder=join(state,'mcp-previews');
  await mkdir(folder,{recursive:true});
  if(await realpath(folder)!==folder)throw Error('Preview cache must stay in project');
  const saved=[];
  for(const input of result.files.slice(0,2)){
   if(typeof input!=='string'||extname(input).toLowerCase()!=='.png')continue;
   const source=await realpath(input);
   const info=await stat(source);
   if(!info.isFile()||info.size<20||info.size>12*1024*1024)continue;
   const dest=join(folder,randomUUID()+'.png');
   await copyFile(source,dest,constants.COPYFILE_EXCL);
   saved.push(dest);
  }
  result.files=saved;
 }
 process.stdout.write('\nMCP_FILM_RESULT='+JSON.stringify(result)+'\n');
}
main().catch(error=>{
 process.stderr.write('Film worker: '+String(error?.message??error).slice(0,1200)+'\n');
 process.exitCode=1;
});
