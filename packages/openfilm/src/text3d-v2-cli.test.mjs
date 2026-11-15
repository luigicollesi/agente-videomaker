import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {text3DCommand} from './text3d-cli.mjs';

test('v2 create scaffolds an offline, structurally valid component',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'text3d-v2-cli-'));
 const draft=join(folder,'draft');
 try{
  const created=await text3DCommand(['create',draft]);
  assert.equal(created.ok,true,created.lines.join(' '));
  const manifest=JSON.parse(await readFile(join(draft,'manifest.json'),'utf8'));
  assert.equal(manifest.contractVersion,2);
  assert.ok((await readFile(join(draft,'assets/font.json'))).length>1000);
  const result=await text3DCommand(['validate',draft]);
  assert.equal(result.ok,true,result.lines.join(' '));
 }finally{await rm(folder,{recursive:true,force:true})}
});


test('v2 end-to-end register packages real WebGL component before registry activation',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'text3d-v2-register-'));
 const previous=process.env.OPENFILM_SAVED;
 process.env.OPENFILM_SAVED=join(folder,'saved');
 try{
  const draft=join(folder,'draft');
  const created=await text3DCommand(['create',draft]);
  assert.equal(created.ok,true,created.lines.join(' '));
  const registered=await text3DCommand(['register',draft]);
  assert.equal(registered.ok,true,registered.lines.join(' '));
  const lookup=await text3DCommand(['inspect','text/example']);
  assert.equal(lookup.ok,true);
  assert.match(lookup.lines[0],/text3d\\/example\\/v1/);
  assert.ok((await readFile(join(folder,'saved/text3d/text3d/example/v1/files/text3d-animation-composer.mjs'))).length>100);
 }finally{
  if(previous===undefined)delete process.env.OPENFILM_SAVED;
  else process.env.OPENFILM_SAVED=previous;
  await rm(folder,{recursive:true,force:true});
 }
});
