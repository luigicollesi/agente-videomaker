import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';
import ts from 'typescript';

async function generator(file) {
 const source=await readFile(new URL('../ui/src/lib/'+file,import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
}
const makeServer=root=>new Promise(resolve=>{
 const server=createServer(async(req,res)=>{
  const requestPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(requestPath.includes('..')){res.writeHead(403).end();return}
  try{const file=await readFile(join(root,requestPath.replace(/^\/+/,'')));res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(file)}
  catch{res.writeHead(404).end('Not found')}
 });
 server.listen(0,'127.0.0.1',()=>resolve(server));
});
test('Text3D original HTML projection seeks its child source clock deterministically', {timeout:90_000}, async()=>{
 const {buildProjectionHtml}=await generator('text3d-projection.ts');
 const root=await mkdtemp(join(tmpdir(),'openfilm-text3d-projection-'));
 let server,browser;
 try{
  const originalPath=join(root,'saved','source','original.html'),converted=join(root,'text3d','converted.html');
  await mkdir(dirname(originalPath),{recursive:true});await mkdir(dirname(converted),{recursive:true});
  await writeFile(originalPath,`<!doctype html><html><body style="margin:0;background:transparent"><p id="value">initial</p><script>window.film={frame(t){document.getElementById('value').textContent=t.toFixed(2)}};</script></body></html>`);
  await writeFile(converted,buildProjectionHtml('saved/source/original.html',2.5));
  server=await makeServer(root);
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader']});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/text3d/converted.html`);
  const getTime=async(t)=>page.evaluate(async value=>{
   await window.film.frame(value);
   return document.querySelector('iframe').contentDocument.getElementById('value').textContent;
  },t);
  assert.equal(await getTime(4),'6.50');
  assert.equal(await getTime(1),'3.50');
  assert.equal(await getTime(4),'6.50');
 } finally{await browser?.close();await new Promise(r=>server?.close(r)??r());await rm(root,{recursive:true,force:true})}
});
test('Text3D generated triangle mesh draws and clears at effective clip end', {timeout:90_000}, async()=>{
 const {buildGeometryHtml}=await generator('text3d-geometry.ts');
 const root=await mkdtemp(join(tmpdir(),'openfilm-text3d-geometry-'));
 let server,browser;
 try{
  await writeFile(join(root,'geometry.html'),buildGeometryHtml('HELLO'));
  server=await makeServer(root);browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/geometry.html`);
  const sample=async(t)=>page.evaluate(value=>{
   const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2');
   if(!gl)return null;
   window.film.frame(value);
   const data=new Uint8Array(canvas.width*canvas.height*4);
   gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,data);
   let count=0;for(let p=3;p<data.length;p+=4)if(data[p])count++;return count;
  },t);
  const start=await sample(4);
  if(start===null)return;
  assert.ok(start>0,'geometry must render visible pixels');
  assert.equal(await sample(10.5),0,'clip has no visible pixels at its effective end');
 } finally{await browser?.close();await new Promise(r=>server?.close(r)??r());await rm(root,{recursive:true,force:true})}
});
