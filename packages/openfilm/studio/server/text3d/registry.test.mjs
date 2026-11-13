import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { activeText3D, displayText3D, listText3D, registerText3D } from './registry.mjs';

test('Text3D registry preserves version identity and archives old versions by display name only',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'openfilm-text3d-registry-'));
 try {
  const base={source2DId:'text/burn',bundlePath:'saved/text3d/burn',displayName:'Burn 3D',sourceRevision:'sha256:abc',status:'ready',parameterMap:{Text:'Text'}};
  const first=await registerText3D({...base,componentId:'text3d/burn/v1',version:'v1'},dir);
  assert.equal(first.active,true);
  assert.equal((await activeText3D('text/burn',dir)).componentId,'text3d/burn/v1');
  await registerText3D({...base,componentId:'text3d/burn/v2',version:'v2',bundlePath:'saved/text3d/burn-v2'},dir);
  const versions=await listText3D('text/burn',dir);
  assert.equal(versions.length,2);
  assert.equal(displayText3D(versions[0]),'Burn 3D');
  assert.equal(displayText3D(versions[1]),'Burn 3D — old_v1');
  assert.equal(versions[1].componentId,first.componentId);
  await assert.rejects(registerText3D({...base,componentId:'text3d/burn/v3',version:'v2'},dir));
 } finally {await rm(dir,{recursive:true,force:true})}
});
