import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {listObject3D,inspectObject3D,object3DCommand,listObject3DAvailable} from './object3d-catalog.mjs';

test('object catalog only exposes installed assets with matching metadata',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'videomaker-object3d-test-'));
 try{
  const valid=join(dir,'chocolate');
  await mkdir(valid);
  await writeFile(join(valid,'model.glb'),'fixture');
  await writeFile(join(valid,'manifest.json'),JSON.stringify({id:'chocolate',name:'Chocolate',format:'glb',parts:['Body','Piece_1'],materials:['Milk']}));
  await mkdir(join(dir,'without-model'));
  await writeFile(join(dir,'without-model','manifest.json'),JSON.stringify({id:'without-model',name:'Missing',format:'glb'}));
  await mkdir(join(dir,'wrong-id'));
  await writeFile(join(dir,'wrong-id','model.glb'),'fixture');
  await writeFile(join(dir,'wrong-id','manifest.json'),JSON.stringify({id:'other',name:'Incorrect',format:'glb'}));
  assert.deepEqual((await listObject3D(dir)).map(x=>x.id),['chocolate']);
  const item=await inspectObject3D('chocolate',dir);
  assert.deepEqual(item.parts,['Body','Piece_1']);
  assert.deepEqual(item.materials,['Milk']);
  assert.equal(item.category,'object3d');
  await assert.rejects(()=>inspectObject3D('../escape',dir),/Invalid/);
  await assert.rejects(()=>inspectObject3D('wrong-id',dir),/not installed/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('missing object catalog is an empty discoverable collection',async()=>{
 const dir=join(tmpdir(),'nonexistent-object3d-catalog-probe-'+process.pid);
 assert.deepEqual(await listObject3D(dir),[]);
});

test('native cube and sphere are discoverable and CLI import copies only the requested asset',async()=>{
 const listing=await listObject3DAvailable();
 assert.deepEqual(listing.filter(x=>x.type==='procedural').map(x=>x.id),['object3d/cube','object3d/sphere']);
 const inspected=await object3DCommand(['inspect','object3d/sphere']);
 assert.equal(JSON.parse(inspected.lines[0]).materials[0],'sphere-material');
 const root=await mkdtemp(join(tmpdir(),'videomaker-object3d-cli-'));
 try{
  await writeFile(join(root,'film.html'),'<!doctype html><html></html>');
  const imported=await object3DCommand(['take',root,'object3d/sphere']);
  const receipt=JSON.parse(imported.lines[0]);
  assert.equal(receipt.status,'imported');
  assert.equal(receipt.asset,'object3d/sphere');
  assert.equal(receipt.path,'saved/openfilm/object3d-sphere/index.html');
  assert.equal(receipt.inserted,false);
  await assert.rejects(()=>object3DCommand(['take',root,'object3d/not-real']),/Unknown built-in/);
 }finally{await rm(root,{recursive:true,force:true})}
});
