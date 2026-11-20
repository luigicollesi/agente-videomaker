import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureObject3DBuiltIn, isObject3DBuiltInFile, OBJECT3D_BUILTIN_ID } from './object3d-built-in.mjs';

test('built-in cube generates one offline Saved bundle and can be reused', async () => {
 const root = await mkdtemp(join(tmpdir(), 'videomaker-object-library-'));
 try {
   assert.equal(isObject3DBuiltInFile(OBJECT3D_BUILTIN_ID),true);
   assert.equal(isObject3DBuiltInFile('object3d/cube/files/index.html'),true);
   assert.equal(isObject3DBuiltInFile('object3d/cube-old'),false);
   const paths = await Promise.all([ensureObject3DBuiltIn(root),ensureObject3DBuiltIn(root)]);
   assert.equal(paths[0],paths[1]);
   const manifest=JSON.parse(await readFile(join(paths[0],'saved.json'),'utf8'));
   assert.equal(manifest.kind,'clip');
   assert.deepEqual(manifest.clip.time,[0,8]);
   assert.equal(manifest.clip.attrs['data-openfilm-content-type'],'object3d');
   assert.deepEqual(JSON.parse(manifest.clip.attrs['data-props']).map(p=>p.var),['--object3d-color','--object3d-roughness','--object3d-metalness']);
   for(const file of ['files/index.html','files/object3d-scene.mjs','files/object3d-camera.mjs','files/vendor/three.module.js','files/vendor/three.core.js'])
     assert.ok((await stat(join(paths[0],file))).isFile(),file);
   assert.equal(await ensureObject3DBuiltIn(root),paths[0]);
 } finally { await rm(root,{recursive:true,force:true}) }
});

test('sphere and cube create independent offline bundles with stable part IDs',async()=>{
 const root=await mkdtemp(join(tmpdir(),'videomaker-object-library-shapes-'));
 try{
  const cube=await ensureObject3DBuiltIn(root);
  const sphere=await ensureObject3DBuiltIn(root,'object3d/sphere');
  assert.notEqual(cube,sphere);
  const cubeHTML=await readFile(join(cube,'files','index.html'),'utf8');
  const sphereHTML=await readFile(join(sphere,'files','index.html'),'utf8');
  assert.match(cubeHTML,/data-object3d-shape="cube"/);
  assert.match(sphereHTML,/data-object3d-shape="sphere"/);
  const cubeBefore=await readFile(join(cube,'saved.json'),'utf8');
  const sphereBefore=await readFile(join(sphere,'saved.json'),'utf8');
  assert.equal(await ensureObject3DBuiltIn(root,'object3d/sphere'),sphere);
  assert.equal(await readFile(join(cube,'saved.json'),'utf8'),cubeBefore);
  assert.equal(await readFile(join(sphere,'saved.json'),'utf8'),sphereBefore);
  assert.equal(isObject3DBuiltInFile('object3d/sphere/files/index.html'),true);
  assert.equal(isObject3DBuiltInFile('object3d/sphere-old'),false);
  await assert.rejects(()=>ensureObject3DBuiltIn(root,'object3d/unknown'),/Unknown native/);
 }finally{await rm(root,{recursive:true,force:true})}
});

test('incomplete existing cached cube is not overwritten or silently accepted',async()=>{
 const root=await mkdtemp(join(tmpdir(),'videomaker-object-library-incomplete-'));
 try{
   await mkdir(join(root,'object3d','cube'),{recursive:true});
   await assert.rejects(()=>ensureObject3DBuiltIn(root),/incomplete/);
 }finally{await rm(root,{recursive:true,force:true})}
});
