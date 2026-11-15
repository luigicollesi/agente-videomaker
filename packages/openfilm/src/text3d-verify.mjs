// @ts-check
/** Verify the actual packaged Text3D page before publishing it to Saved. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, relative, sep } from 'node:path';
import { chromium } from 'playwright-core';

export class Text3DVisualError extends Error {
 /** @param {string} code @param {string} detail */
 constructor(code,detail){super(code+': '+detail);this.code=code;}
}
const TYPES={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.woff2':'font/woff2','.css':'text/css'};
/** @param {string} directory @param {number} duration */
export async function verifyText3D(directory,duration=10) {
 const root=resolve(directory);
 const manifest=await readFile(resolve(root,'manifest.json'),'utf8').then(JSON.parse).catch(()=>null);
 const requireV2=manifest?.contractVersion===2;
 const server=createServer(async(req,res)=>{
  try {
   const pathname=decodeURIComponent(new URL(req.url??'/','http://localhost').pathname);
   const path=resolve(root,'.'+pathname);
   if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return}
   const bytes=await readFile(path);
   res.writeHead(200,{'content-type':TYPES[extname(path)]??'application/octet-stream'});
   res.end(bytes);
  }catch{res.writeHead(404).end('Missing asset')}
 });
 let browser;
 try{
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok)});
  try{
   browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
  }catch(e){throw new Text3DVisualError('BROWSER_UNAVAILABLE',String(e))}
  const page=await browser.newPage({viewport:{width:960,height:540}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',req=>errors.push('Request failed: '+req.url()+' '+(req.failure()?.errorText??'')));
  page.on('response',res=>{if(res.status()>=400)errors.push('HTTP '+res.status()+': '+res.url())});
  const address=server.address();
  if(!address||typeof address==='string')throw new Text3DVisualError('SERVER_ERROR','Unable to resolve local test server');
  const url='http://127.0.0.1:'+address.port+'/index.html';
  await page.goto(url,{waitUntil:'load',timeout:20000});
  // Distinguish a broken graphics environment from a broken Text3D component.
  const capability=await page.evaluate(()=>{
   const canvas=document.createElement('canvas');
   const gl=canvas.getContext('webgl2');
   if(!gl)return 'WEBGL_UNAVAILABLE';
   return gl.isContextLost()?'CONTEXT_LOST_WEBGL':'ready';
  });
  if(capability!=='ready')throw new Text3DVisualError(capability,'Chromium cannot render a basic WebGL2 canvas');
  try{await page.waitForFunction(()=>!!window.film&&!!window.film.ready,null,{timeout:15000});await page.evaluate(()=>window.film.ready)}catch(e){throw new Text3DVisualError('PAGE_INIT_FAILED',String(e))}
  const component=await page.evaluate(async()=>{
   if(!window.__text3dComponent)return {legacy:true};
   const c=await window.__text3dComponent;
   const meshes=c?.model?.meshes;
   const canvas=document.querySelector('canvas');
   return {legacy:false,version:c?.contractVersion,webgl:c?.renderer?.isWebGLRenderer===true,
    canvasMatches:c?.renderer?.domElement===canvas,scene:c?.scene?.isScene===true,
    camera:c?.camera?.isCamera===true,meshes:Array.isArray(meshes)?meshes.filter(m=>{if(!m?.isMesh||!m.geometry?.isBufferGeometry||!(m.geometry?.attributes?.position?.count>0))return false;let p=m;while(p&&p!==c.scene)p=p.parent;return p===c.scene}).length:0};
  });
  if(requireV2&&component.legacy)throw new Text3DVisualError('INVALID_3D_CONTRACT','v2 component must expose window.__text3dComponent');
  if(!component.legacy&&(!component.webgl||!component.canvasMatches||!component.scene||!component.camera||component.meshes<1||component.version!==2))
   throw new Text3DVisualError('INVALID_3D_GEOMETRY',JSON.stringify(component));
  const times=[Math.min(.5,duration*.15),duration*.5,Math.max(.5,duration*.85)].filter(t=>t<duration);
  let visible=0;
  const samples=[];
  for(const t of times){
   const result=await page.evaluate(async time=>{
    await window.film.frame(time);
    const canvas=document.querySelector('canvas');
    if(!canvas)return {error:'MISSING_CANVAS'};
    const gl=canvas.getContext('webgl2')??canvas.getContext('webgl');
    if(!gl)return {error:'WEBGL_UNAVAILABLE'};
    if(gl.isContextLost())return {error:'CONTEXT_LOST_WEBGL'};
    const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
    if(!width||!height)return {error:'BLANK_FRAME'};
    const pixels=new Uint8Array(width*height*4);
    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let count=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>10)count++;
    return {count};
   },t).catch(e=>({error:'FRAME_EXCEPTION',detail:String(e)}));
   if('error' in result)throw new Text3DVisualError(result.error,result.detail??'Frame '+t);
   samples.push({time:t,count:result.count??0});
   visible=Math.max(visible,result.count??0);
  }
  // Seek away and back: the same absolute time must render the same visible picture.
  // Ignore tiny per-channel antialiasing jitter, but reject material/lighting/frame changes.
  if(requireV2&&times.length>1){
   const repeat=await page.evaluate(async ([away,at])=>{
    const gl=document.querySelector('canvas')?.getContext('webgl2');
    if(!gl)return {error:'WEBGL_UNAVAILABLE'};
    const capture=async t=>{
     await window.film.frame(t);
     const data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
     gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);
     return data;
    };
    const a=await capture(at);
    await capture(away);
    const b=await capture(at);
    let changed=0,visible=0;
    for(let i=0;i<a.length;i+=4){
     if(a[i+3]>10||b[i+3]>10)visible++;
     if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),
       Math.abs(a[i+2]-b[i+2]),Math.abs(a[i+3]-b[i+3]))>8)changed++;
    }
    return {changed,visible};
   },[times[0],times[1]]).catch(e=>({error:'FRAME_EXCEPTION',detail:String(e)}));
   if('error' in repeat)throw new Text3DVisualError(repeat.error,repeat.detail??'Repeated frame');
   if(repeat.changed>Math.max(100,repeat.visible*.005))
    throw new Text3DVisualError('NONDETERMINISTIC_FRAME',
     'Repeated absolute time '+times[1]+' differs after seeking: '+JSON.stringify(repeat));
  }
  if(errors.length)throw new Text3DVisualError('PAGE_ERROR',errors.join('; '));
  if(visible<100)throw new Text3DVisualError('BLANK_FRAME','No sufficiently visible pixels at sampled times: '+JSON.stringify(samples)+'; meshes='+component.meshes+'. Check font glyph contours, opacity, and animation timing.');
  return {ok:true,visiblePixels:visible,times};
 }finally{await browser?.close();await new Promise(ok=>server.close(()=>ok(null)))}
}
