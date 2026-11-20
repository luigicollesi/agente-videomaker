import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createObject3DDemo} from './object3d-demo.mjs';
import {object3DCommand} from './object3d-catalog.mjs';

test('opt-in Scene3D demo packages local WebGL dependencies, without touching existing clips',async()=>{
 const root=await mkdtemp(join(tmpdir(),'videomaker-scene-demo-'));
 const target=join(root,'scene-demo');
 try{
  const result=await createObject3DDemo(target);
  assert.equal(result.inserted,false);
  assert.equal(result.durationSeconds,8);
  assert.equal(result.page,join(target,'index.html'));
  const names=(await readdir(target)).sort();
  assert.deepEqual(names,['index.html','object3d-camera.mjs','object3d-scene.mjs','vendor']);
  const html=await readFile(result.page,'utf8');
  assert.match(html,/window\.film=\{ready:Promise\.resolve\(\),frame,frameReadsOverrides:true\}/);
  assert.match(html,/__object3dHitTest=hitTest/);
  assert.match(html,/new THREE\.BoxGeometry/);
  assert.ok((await stat(join(target,'vendor','three.module.js'))).size>1000);
  assert.ok((await stat(join(target,'vendor','three.core.js'))).size>1000);
  await assert.rejects(()=>createObject3DDemo(target),/already exists/);
  assert.equal(await readFile(result.page,'utf8'),html);
  const cli=await object3DCommand(['demo',join(root,'second-demo')]);
  assert.equal(cli.ok,true);
  assert.equal(JSON.parse(cli.lines[0]).inserted,false);
 }finally{await rm(root,{recursive:true,force:true})}
});
