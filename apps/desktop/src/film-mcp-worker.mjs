/** Isolated native film preview/render worker. The parent MCP owns input validation, timeouts and publishing. */
import { resolve } from 'node:path';

async function main(){
 const job=JSON.parse(process.argv[2]??'null');
 if(!job||!['look','render','text3d-preview','text3d-command'].includes(job.kind)||typeof job.root!=='string')throw Error('Invalid film worker request');
 const root=resolve(job.root);
 process.chdir(root);
 let result;
 if(job.kind==='text3d-command'){
  if(!Array.isArray(job.args)||!['font-add','register','apply'].includes(job.args[0])||job.args.length>4)
   throw Error('Unsupported Text3D action');
  const {text3DCommand}=await import('openfilm/text3d-cli');
  const done=await text3DCommand(job.args,job.args[0]==='apply'?{expectedRevision:job.revision}:{});
  if(!done.ok)throw Error((done.lines??[]).slice(0,4).join(' ').slice(0,900)||'Text3D command failed');
  result={action:job.args[0],revision:done.revision??null,lines:(done.lines??[]).slice(0,4)};
 }else if(job.kind==='text3d-preview'){
  const {text3DCommand}=await import('openfilm/text3d-cli');
  const done=await text3DCommand(['preview',job.source]);
  if(!done.ok)throw Error((done.lines??[]).slice(0,5).join(' ').slice(0,900)||'Text3D preview failed');
  result={preview:job.source+'-preview/files/index.html',lines:(done.lines??[]).slice(0,5)};
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
 process.stdout.write('\nMCP_FILM_RESULT='+JSON.stringify(result)+'\n');
}
main().catch(error=>{
 process.stderr.write('Film worker: '+String(error?.message??error).slice(0,1200)+'\n');
 process.exitCode=1;
});
