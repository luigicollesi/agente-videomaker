import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { timelineSource } from './mcp/timeline-source.mjs';

test('timeline HTML sources are confined to ordinary project files; non-HTML still use the existing media validator',async()=>{
 const root=await mkdtemp(join(tmpdir(),'videomaker-source-'));
 const outside=await mkdtemp(join(tmpdir(),'videomaker-source-out-'));
 try{
  await mkdir(join(root,'cenas'));
  await mkdir(join(root,'.film'));
  await writeFile(join(root,'film.html'),'<html></html>');
  await writeFile(join(root,'cenas','intro.html'),'<html></html>');
  await writeFile(join(root,'.film','hidden.html'),'<html></html>');
  await writeFile(join(root,'assets-test.wav'),'audio');
  await writeFile(join(outside,'secret.html'),'<html></html>');
  const calls=[];
  const existingMedia=async path=>{calls.push(path);throw Error('Existing media validation rejected source')};
  assert.equal(await timelineSource(root,'cenas/intro.html',existingMedia),'cenas/intro.html');
  assert.equal(await timelineSource(root,join(root,'cenas','intro.html'),existingMedia),'cenas/intro.html');
  assert.deepEqual(calls,[]);
  for(const raw of ['film.html','.film/hidden.html',join(outside,'secret.html'),'../secret.html']){
   await assert.rejects(timelineSource(root,raw,existingMedia));
  }
  let symlinkCreated=false;
  try{await symlink(join(outside,'secret.html'),join(root,'cenas','linked.html'));symlinkCreated=true}
  catch(error){if(process.platform!=='win32'||!['EPERM','EACCES'].includes(error.code))throw error}
  if(symlinkCreated)await assert.rejects(timelineSource(root,'cenas/linked.html',existingMedia));
  await assert.rejects(timelineSource(root,'assets-test.wav',existingMedia),/Existing media validation/);
  assert.deepEqual(calls,['assets-test.wav']);
 }finally{
  await rm(root,{recursive:true,force:true});
  await rm(outside,{recursive:true,force:true});
 }
});
