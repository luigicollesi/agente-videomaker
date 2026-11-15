/** Local, read-only Media vision MCP server. No external dependencies. */
import { createInterface } from 'node:readline';
import { readFile, mkdtemp, rm, realpath, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname, relative, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';

const project=resolve(process.env.VIDEOMAKER_PROJECT || process.cwd());
const images=new Set(['.jpg','.jpeg','.png','.webp']);
const videos=new Set(['.mp4','.mov','.webm','.mkv','.avi','.m4v']);
const schema={type:'object',properties:{path:{type:'string',description:'Media path inside project/assets'}} ,required:['path']};
const tools=[
 {name:'inspect_image',description:'Inspect an image from this project Media. Returns visual image content, not a filename description.',inputSchema:schema},
 {name:'inspect_video',description:'Inspect a video from this project Media. Returns timestamped image frames. Sampled frames do not guarantee exact event boundaries.',inputSchema:{type:'object',properties:{...schema.properties,start:{type:'number',minimum:0},end:{type:'number',minimum:0},max_frames:{type:'integer',minimum:1,maximum:24}},required:['path']}}
];
async function safePath(raw,extensions){
 if(typeof raw!=='string'||!raw.trim())throw Error('Missing Media path');
 const base=await realpath(join(project,'assets'));
 const file=await realpath(isAbsolute(raw)?raw:resolve(project,raw));
 const rel=relative(base,file);
 if(rel.startsWith('..')||isAbsolute(rel)||!rel||!extensions.has(extname(file).toLowerCase()))throw Error('Path must be an allowed file in project/assets');
 if(!(await stat(file)).isFile())throw Error('Not a file');
 return file;
}
function exec(name,args,timeout=30000){
 return new Promise((yes,no)=>{
  const child=spawn(name,args,{stdio:['ignore','pipe','pipe']});
  const out=[],err=[];
  const timer=setTimeout(()=>child.kill('SIGKILL'),timeout);
  child.stdout.on('data',d=>out.push(d));child.stderr.on('data',d=>err.push(d));
  child.on('error',e=>{clearTimeout(timer);no(e)});
  child.on('close',code=>{clearTimeout(timer);code===0?yes(Buffer.concat(out)):no(Error(Buffer.concat(err).toString().slice(0,600)||name+' failed'))});
 });
}
const image=(data,mime)=>({type:'image',mimeType:mime,data:data.toString('base64')});
async function inspect(name,args){
 const path=await safePath(args?.path,name==='inspect_image'?images:videos);
 if(name==='inspect_image'){
  const data=await readFile(path);
  if(data.length>15_000_000)throw Error('Image exceeds 15 MB');
  return {content:[image(data,extname(path).toLowerCase()==='.png'?'image/png':extname(path).toLowerCase()==='.webp'?'image/webp':'image/jpeg')]};
 }
 if(name!=='inspect_video')throw Error('Unknown tool');
 const probe=JSON.parse((await exec('ffprobe',['-v','error','-show_entries','format=duration','-of','json',path])).toString());
 const duration=Number(probe.format?.duration);
 const start=args?.start??0,end=args?.end??duration,n=args?.max_frames??12;
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>duration+.01||end<=start||!Number.isInteger(n)||n<1||n>24)throw Error('Invalid interval or frame count');
 const folder=await mkdtemp(join(tmpdir(),'videomaker-media-mcp-'));
 try{
  const content=[];
  for(let i=0;i<n;i++){
   const time=start+(Math.min(end,duration)-start)*(i+.5)/n;
   const dest=join(folder,`frame-${i}.jpg`);
   await exec('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-ss',time.toFixed(5),'-i',path,'-frames:v','1','-vf','scale=960:-2:force_original_aspect_ratio=decrease','-q:v','4',dest],15000);
   content.push({type:'text',text:`Frame ${i+1}/${n} at ${time.toFixed(3)} seconds`});
   content.push(image(await readFile(dest),'image/jpeg'));
  }
  return {content};
 }finally{await rm(folder,{recursive:true,force:true})}
}
function send(value){process.stdout.write(JSON.stringify(value)+'\n')}
const rl=createInterface({input:process.stdin,crlfDelay:Infinity});
rl.on('line',async line=>{
 let msg;try{msg=JSON.parse(line)}catch{return}
 if(msg.id===undefined)return;
 try{
  let result;
  switch(msg.method){
   case 'initialize':result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'videomaker-media',version:'1.0.0'}};break;
   case 'ping':result={};break;
   case 'tools/list':result={tools};break;
   case 'tools/call':result=await inspect(msg.params?.name,msg.params?.arguments);break;
   default:send({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Method not found'}});return;
  }
  send({jsonrpc:'2.0',id:msg.id,result});
 }catch(e){send({jsonrpc:'2.0',id:msg.id,result:{isError:true,content:[{type:'text',text:String(e.message||e)}]}})}
});
