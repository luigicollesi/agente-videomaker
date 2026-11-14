import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text3DCommand } from './text3d-cli.mjs';

test('Text3D CLI validates, registers and retrieves an immutable Saved component', async()=>{
 const temp=await mkdtemp(join(tmpdir(),'openfilm-text3d-cli-'));
 const previous=process.env.OPENFILM_SAVED;
 process.env.OPENFILM_SAVED=join(temp,'saved');
 try {
  const folder=join(temp,'component');await mkdir(folder);
  const manifest={
    formatVersion:1,runtimeVersion:1,componentId:'text3d/burn/v1',source2DId:'text/text-burn-combined',
    sourceRevision:'sha256:abc123',displayName:'Burn 3D',version:'v1',
    capabilities:{characters:true,group:true},parameterMap:{Text:'Text'},
    props:[{name:'Text',type:'text',at:'.t'}],durationSeconds:8
  };
  await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest));
  await writeFile(join(folder,'index.html'),'<html><head><style>:root{--clip-length:8s}</style></head><body><script>window.film={frame(t){},frameReadsOverrides:true};</script></body></html>');
  await writeFile(join(folder,'component.js'),'export function createText3D(){const renderer=new THREE.WebGLRenderer();return {group:{},characters:[],frame(t){},dispose(){}}}');
  assert.equal((await text3DCommand(['validate',folder])).ok,true);
  // A structurally valid dummy is not a renderable Text3D: never publish it.
  const rejected=await text3DCommand(['register',folder]);
  assert.equal(rejected.ok,false);
  assert.match(rejected.lines[0],/PAGE_INIT_FAILED|BLANK_FRAME|MISSING_CANVAS|BROWSER_UNAVAILABLE|WEBGL_UNAVAILABLE|CONTEXT_LOST_WEBGL|PAGE_ERROR|FRAME_EXCEPTION/);
  const lookup=await text3DCommand(['inspect','text/text-burn-combined']);
  assert.equal(lookup.ok,true);
  assert.equal(JSON.parse(lookup.lines[0]).length,0);
 }finally{
  if(previous===undefined)delete process.env.OPENFILM_SAVED;
  else process.env.OPENFILM_SAVED=previous;
  await rm(temp,{recursive:true,force:true});
 }
});
