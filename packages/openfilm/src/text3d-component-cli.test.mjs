import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {text3DCommand} from './text3d-cli.mjs';

test('Text3D create scaffolds an offline, structurally valid component',async()=>{
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


test('Text3D end-to-end register packages real WebGL component before registry activation',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'text3d-v2-register-'));
 const previous=process.env.OPENFILM_SAVED;
 process.env.OPENFILM_SAVED=join(folder,'saved');
 try{
  const draft=join(folder,'draft');
  const created=await text3DCommand(['create',draft]);
  assert.equal(created.ok,true,created.lines.join(' '));
  const preview=await text3DCommand(['preview',draft]);
  assert.equal(preview.ok,true,preview.lines.join(' '));
  assert.ok(preview.lines[0].includes('files/index.html'));
  assert.ok((await readFile(join(draft+'-preview','files','vendor','three.module.js'))).length>100);
  const before=await text3DCommand(['inspect','text/example']);
  assert.equal(JSON.parse(before.lines[0]).length,0,'preview must not register');
  const registered=await text3DCommand(['register',draft]);
  assert.equal(registered.ok,true,registered.lines.join(' '));
  const lookup=await text3DCommand(['inspect','text/example']);
  assert.equal(lookup.ok,true);
  assert.match(lookup.lines[0],/text3d\\/example/);
  const registry=JSON.parse(await readFile(join(folder,'saved/.text3d-registry.json'),'utf8'));
  const bundle=registry.entries[0].bundlePath.slice('saved/'.length);
  assert.ok((await readFile(join(folder,'saved',bundle,'files/text3d-animation-composer.mjs'))).length>100);
 }finally{
  if(previous===undefined)delete process.env.OPENFILM_SAVED;
  else process.env.OPENFILM_SAVED=previous;
  await rm(folder,{recursive:true,force:true});
 }
});


test('Text3D TTF conversion keeps exported typeface self-contained',async(t)=>{
 const filename='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
 if(!existsSync(filename)){t.skip('DejaVu TTF not installed on runner');return}
 const {TTFLoader}=await import('three/addons/loaders/TTFLoader.js');
 const bytes=await readFile(filename);
 const json=new TTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 assert.ok(json.glyphs?.A,'Converted typeface must include A');
 assert.ok(json.glyphs?.['é'],'Converted typeface must include accented glyphs');
});
