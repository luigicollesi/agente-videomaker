import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,extname} from 'node:path';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {text3DCommand} from './text3d-cli.mjs';

const source=fileURLToPath(new URL('../examples/text3d-sample/',import.meta.url));
test('a registered vector Text3D component renders deterministic frames with Three.js offline', {timeout:120_000}, async(t)=>{
 const temp=await mkdtemp(join(tmpdir(),'openfilm-text3d-visual-'));
 const before=process.env.OPENFILM_SAVED;
 process.env.OPENFILM_SAVED=join(temp,'saved');
 let server,browser;
 try{
  const registered=await text3DCommand(['register',source]);
  assert.equal(registered.ok,true,registered.lines.join(' '));
  const root=process.env.OPENFILM_SAVED;
  server=createServer(async(req,res)=>{
   const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(name.includes('..')){res.writeHead(403).end();return}
   try{
    const data=await readFile(join(root,name.replace(/^\/+/,'')));
    const ext=extname(name);
    res.writeHead(200,{'content-type':ext==='.html'?'text/html':ext==='.json'?'application/json':'application/javascript'});
    res.end(data);
   }catch{res.writeHead(404).end('missing')}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
  const page=await browser.newPage({viewport:{width:960,height:540}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/text3d/text3d/sample/v1/files/index.html');
  await page.waitForFunction(()=>Boolean(window.film));
  const read=async(time)=>page.evaluate(async t=>{
   await window.film.ready;
   await window.film.frame(t);
   const canvas=document.getElementById('scene');
   const gl=canvas.getContext('webgl2');
   if(!gl)return null;
   const data=new Uint8Array(canvas.width*canvas.height*4);
   gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,data);
   let pixels=0;for(let p=3;p<data.length;p+=4)if(data[p]>10)pixels++;
   return pixels;
  },time);
  const beforeEnd=await read(4);
  assert.notEqual(beforeEnd,null,'WebGL2 must be available in this Chromium test');
  assert.ok(beforeEnd>100,'TextGeometry must render visible pixels');
  assert.equal(await read(10),0,'the final frame must be transparent');
  assert.equal(await read(4),beforeEnd,'seeking backwards must reproduce the same visible frame');
  assert.deepEqual(errors,[]);
 }finally{
  await browser?.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  if(before===undefined)delete process.env.OPENFILM_SAVED;else process.env.OPENFILM_SAVED=before;
  await rm(temp,{recursive:true,force:true});
 }
});
