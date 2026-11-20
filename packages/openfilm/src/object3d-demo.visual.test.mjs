import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,sep,extname} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
import {createObject3DDemo} from './object3d-demo.mjs';

test('packaged Object3D cube renders real transparent WebGL, deterministic seek and blank final frame',{timeout:120000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'videomaker-object3d-visual-'));
 let server,browser;
 try{
  await createObject3DDemo(join(root,'cube'));
  server=createServer(async(req,res)=>{
   try{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=resolve(root,'.'+name);
    if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403).end();return;}
    const body=await readFile(file);
    const type={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json'}[extname(file)]??'application/octet-stream';
    res.writeHead(200,{'content-type':type});res.end(body);
   }catch{res.writeHead(404).end('missing')}
  });
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok)});
  browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:960,height:540}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',req=>errors.push('request failed: '+req.url()));
  await page.goto('http://127.0.0.1:'+server.address().port+'/cube/index.html');
  await page.waitForFunction(()=>Boolean(window.film&&window.__object3dComponent),null,{timeout:20000});
  const result=await page.evaluate(async()=>{
   await window.film.ready;
   const gl=document.querySelector('canvas').getContext('webgl2');
   if(!gl||gl.isContextLost())return {error:'WebGL unavailable'};
   const sample=async t=>{
    await window.film.frame(t);
    const data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);
    let visible=0;
    for(let i=3;i<data.length;i+=4)if(data[i]>16)visible++;
    return {visible,bytes:data};
   };
   const first=await sample(2);
   const changed=await sample(5);
   const replay=await sample(2);
   let differing=0;
   for(let i=0;i<first.bytes.length;i++)if(Math.abs(first.bytes[i]-replay.bytes[i])>8)differing++;
   const ended=await sample(8);
   return {first:first.visible,changed:changed.visible,end:ended.visible,differing,
      realMesh:window.__object3dComponent.scene.children.some(n=>n.children?.some(m=>m.isMesh)),
      hitCenter:window.__object3dHitTest(.5,.5),
      hitCorner:window.__object3dHitTest(0,0)};
  });
  assert.equal(result.error,undefined,JSON.stringify(result));
  assert.ok(result.first>1000,'demo must draw enough visible pixels');
  assert.ok(result.changed>1000,'orbit must show cube at another instant');
  assert.equal(result.end,0,'final frame is transparent');
  assert.ok(result.differing<100,'same absolute time should reproduce same pixels');
  assert.equal(result.realMesh,true);
  assert.equal(result.hitCenter,true);
  assert.equal(result.hitCorner,false);
  assert.deepEqual(errors,[]);
 }finally{
  await browser?.close();
  if(server)await new Promise(ok=>server.close(()=>ok(null)));
  await rm(root,{recursive:true,force:true});
 }
});
