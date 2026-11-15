import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {registerText3D,listText3D,activeText3D,displayText3D} from './registry.mjs';
test('Text3D registry replaces active stable ID without accumulating versions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'text3d-single-'));
 try{
  const base={source2DId:'text/burn',componentId:'text3d/burn',bundlePath:'saved/text3d/burn-aaa',displayName:'Burn',sourceRevision:'current',parameterMap:{Text:'Text'},status:'ready'};
  await registerText3D(base,root);
  await registerText3D({...base,bundlePath:'saved/text3d/burn-bbb'},root);
  const entries=await listText3D('text/burn',root);
  assert.equal(entries.length,1);
  assert.equal(entries[0].bundlePath,'saved/text3d/burn-bbb');
  assert.equal((await activeText3D('text/burn',root)).componentId,'text3d/burn');
  assert.equal(displayText3D(entries[0]),'Burn');
  await assert.rejects(registerText3D({...base,componentId:'text3d/burn/v3'},root));
 }finally{await rm(root,{recursive:true,force:true})}
});
