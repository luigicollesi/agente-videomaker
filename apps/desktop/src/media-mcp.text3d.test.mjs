import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { draftPath, draftFingerprint, recordPreview, requireVerifiedPreview } from './mcp/text3d-safety.mjs';

test('Text3D registration needs a verified preview of an unchanged scoped draft',async()=>{
 const root=await mkdtemp(join(tmpdir(),'videomaker-text3d-proof-'));
 try{
  const base=join(root,'.film','text3d-drafts');
  const draft=join(base,'title-a');
  await mkdir(draft,{recursive:true});
  await writeFile(join(draft,'manifest.json'),'{"id":"title-a"}\n');
  await writeFile(join(draft,'component.js'),'export default {};\n');
  await mkdir(join(draft,'assets'));
  await writeFile(join(draft,'assets','font.json'),'{"glyphs":{}}\n');
  const preview=draft+'-preview';
  await mkdir(join(preview,'files'),{recursive:true});
  await writeFile(join(preview,'files','index.html'),'<html></html>');
  assert.equal(await draftPath(root,'.film/text3d-drafts/title-a'),draft);
  await assert.rejects(requireVerifiedPreview(draft),/text3d_preview/);
  const before=await draftFingerprint(draft);
  await recordPreview(draft);
  assert.equal(await requireVerifiedPreview(draft),before);
  assert.equal((await readFile(join(preview,'.mcp-source-sha256'),'utf8')).trim(),before);
  await writeFile(join(draft,'component.js'),'export default {changed:true};');
  await assert.rejects(requireVerifiedPreview(draft),/changed after preview/);
  await assert.rejects(recordPreview(draft),/EEXIST/);
  await assert.rejects(draftPath(root,'.film/text3d-drafts'),/direct child/);
  await assert.rejects(draftPath(root,'../outside'),/ENOENT|direct child/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('Text3D draft fingerprint rejects symlinked files', {skip:process.platform==='win32'?'Windows symlink permissions vary':false},async()=>{
 const root=await mkdtemp(join(tmpdir(),'videomaker-text3d-links-'));
 try{
  const draft=join(root,'.film','text3d-drafts','component');
  await mkdir(draft,{recursive:true});
  await writeFile(join(root,'secret.txt'),'private');
  await symlink(join(root,'secret.txt'),join(draft,'private.txt'));
  await assert.rejects(draftFingerprint(draft),/symbolic links/);
 }finally{await rm(root,{recursive:true,force:true})}
});
