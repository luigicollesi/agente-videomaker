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
