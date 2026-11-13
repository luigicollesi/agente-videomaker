import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
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
    formatVersion:1,runtimeVersion:1,componentId:'text3d/burn/v1',source2DId:'text/burn',
    sourceRevision:'sha256:abc123',displayName:'Burn 3D',version:'v1',
    capabilities:{characters:true,group:true},parameterMap:{Text:'Text'},
    props:[{name:'Text',type:'text',at:'.t'}],durationSeconds:8
  };
  await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest));
  await writeFile(join(folder,'index.html'),'<html><style>:root{--clip-length:8s}</style><script>window.film={frame(t){},frameReadsOverrides:true};</script></html>');
  await writeFile(join(folder,'component.js'),'export function createText3D(){return {group:{},characters:[],frame(t){},dispose(){}}}');
  assert.equal((await text3DCommand(['validate',folder])).ok,true);
  assert.equal((await text3DCommand(['register',folder])).ok,true);
  const lookup=await text3DCommand(['inspect','text/burn']);
  assert.equal(lookup.ok,true);
  assert.match(lookup.lines[0],/text3d\/burn\/v1/);
  const saved=JSON.parse(await readFile(join(temp,'saved','text3d','text3d','burn','v1','saved.json'),'utf8'));
  assert.equal(saved.clip.attrs['data-openfilm-content-type'],'text3d');
  const repeated=await text3DCommand(['register',folder]);
  assert.equal(repeated.ok,false);
 }finally{
  if(previous===undefined)delete process.env.OPENFILM_SAVED;
  else process.env.OPENFILM_SAVED=previous;
  await rm(temp,{recursive:true,force:true});
 }
});
