import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('MCP reads canvas in compact pages and searches native library', {timeout:60000}, async()=>{
 const root=await mkdtemp(join(tmpdir(),'videomaker-mcp-discovery-'));
 const script=fileURLToPath(new URL('./media-mcp.mjs',import.meta.url));
 let child;
 try{
  await mkdir(join(root,'.film'));
  await writeFile(join(root,'film.html'),'<!doctype html><html><body></body></html>');
  const nodes=[
   {id:'note-a',x:0,y:0,text:'Opening shot with dramatic light'},
   {id:'note-b',x:100,y:0,text:'Second shot'}
  ];
  await writeFile(join(root,'.film','canvas.json'),JSON.stringify({nodes,edges:[{id:'edge-a',from:'note-a',to:'note-b'}]}));
  child=spawn(process.execPath,[script],{env:{...process.env,VIDEOMAKER_PROJECT:root},stdio:['pipe','pipe','pipe']});
  let buffer='',id=0;
  const pending=new Map();
  child.stdout.on('data',data=>{
   buffer+=data.toString();
   while(buffer.includes('\n')){
    const cut=buffer.indexOf('\n'),line=buffer.slice(0,cut);
    buffer=buffer.slice(cut+1);
    if(!line.trim())continue;
    const reply=JSON.parse(line),done=pending.get(reply.id);
    if(done){pending.delete(reply.id);done(reply)}
   }
  });
  child.on('error',error=>{for(const reject of pending.values())reject({error:String(error)})});
  const call=(name,args={})=>new Promise((resolve,reject)=>{
   const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('MCP timeout: '+name))},30000);
   pending.set(key,reply=>{clearTimeout(timer);resolve(reply)});
   child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:key,method:'tools/call',params:{name,arguments:args}})+'\n');
  });
  const ok=async(name,args={})=>{
   const reply=await call(name,args);
   assert.notEqual(reply.result?.isError,true,JSON.stringify(reply.result));
   return JSON.parse(reply.result.content[0].text);
  };
  const boards=await ok('canvas_list');
  assert.ok(boards.boards.some(b=>b.id==='main'));
  const page=await ok('canvas_nodes',{limit:1,offset:0});
  assert.equal(page.total,2);
  assert.match(page.revision,/^[a-f0-9]{16}$/);
  assert.equal(page.returned,1);
  assert.equal(page.next_offset,1);
  const next=await ok('canvas_nodes',{limit:1,offset:page.next_offset});
  assert.equal(next.returned,1);
  assert.equal(next.next_offset,null);
  assert.equal(next.revision,page.revision);
  const node=await ok('canvas_nodes',{node:'note-a'});
  assert.equal(node.node.text,nodes[0].text);
  assert.equal(node.edges.length,1);
  const missing=await call('canvas_nodes',{board:'missing'});
  assert.equal(missing.result.isError,true);
  const invalidBoard=await call('canvas_apply',{board:'missing',revision:page.revision,ops:[{op:'add',kind:'note',text:'x'}]});
  assert.equal(invalidBoard.result.isError,true);
  const invalidRevision=await call('canvas_apply',{board:'main',revision:'bad-revision',ops:[{op:'add',kind:'note',text:'x'}]});
  assert.equal(invalidRevision.result.isError,true);
  const invalidApply=await call('canvas_apply',{ops:[]});
  assert.equal(invalidApply.result.isError,true);
  const oversizedApply=await call('canvas_apply',{ops:[{op:'add',kind:'note',text:'x'.repeat(41000)}]});
  assert.equal(oversizedApply.result.isError,true);
  const search=await ok('library_search',{kind:'effect',query:'glow',limit:3});
  assert.equal(search.kind,'effect');
  assert.ok(Array.isArray(search.results));
  assert.ok(search.results.length<=3);
  const invalidTake=await call('library_take',{kind:'effect',id:'nonexistent/not-a-real-library-item'});
  assert.equal(invalidTake.result.isError,true);
  const objects=await ok('object3d_list');
  assert.ok(Array.isArray(objects));
  assert.ok(objects.some(item=>item.id==='object3d/cube'&&item.type==='procedural'&&item.editable===true));
  const cube=await ok('object3d_inspect',{id:'object3d/cube'});
  assert.ok(cube.materials.includes('cube-material'));
  const created3D=await ok('object3d_demo_create',{name:'preview-cube'});
  assert.equal(created3D.status,'created');
  assert.equal(created3D.path,'assets/object3d/preview-cube/index.html');
  assert.equal(created3D.inserted,false);
  const duplicate3D=await call('object3d_demo_create',{name:'preview-cube'});
  assert.equal(duplicate3D.result.isError,true);
  const invalid3DName=await call('object3d_demo_create',{name:'../escape'});
  assert.equal(invalid3DName.result.isError,true);
  const missingObject=await call('object3d_inspect',{id:'does-not-exist'});
  assert.equal(missingObject.result.isError,true);
  const orbit=await ok('object3d_camera_orbit_plan',{radius:4,duration:6});
  assert.equal(orbit.status,'planned');
  assert.equal(orbit.applied,false);
  assert.ok(orbit.keyframes.length>=9);
  const invalidOrbit=await call('object3d_camera_orbit_plan',{radius:-1,duration:6});
  assert.equal(invalidOrbit.result.isError,true);
  const registered=await ok('text3d_list',{limit:3});
  assert.ok(Array.isArray(registered.components));
  assert.ok(registered.components.length<=3);
  const missingText3D=await call('text3d_inspect',{component_id:'missing/text3d'});
  assert.equal(missingText3D.result.isError,true);
  const draft=await ok('text3d_create',{name:'mcp-sample'});
  assert.equal(draft.folder,'.film/text3d-drafts/mcp-sample');
  const verified=await ok('text3d_validate',{folder:draft.folder});
  assert.equal(verified.valid,true);
  const secondDraft=await call('text3d_create',{name:'mcp-sample'});
  assert.equal(secondDraft.result.isError,true);
  const invalidPreviewFlag=await call('text3d_preview',{folder:draft.folder,replace_preview:'yes'});
  assert.equal(invalidPreviewFlag.result.isError,true);
  const invalidPreview=await call('text3d_preview',{folder:'../outside-draft'});
  assert.equal(invalidPreview.result.isError,true);
  const noApproval=await call('text3d_register',{folder:draft.folder,visual_approved:false});
  assert.equal(noApproval.result.isError,true);
  const noPreview=await call('text3d_register',{folder:draft.folder,visual_approved:true});
  assert.equal(noPreview.result.isError,true);
  const invalidFont=await call('text3d_font_add',{folder:draft.folder,family:'',weight:400});
  assert.equal(invalidFont.result.isError,true);
  const staleApply=await call('text3d_apply',{revision:'0000000000000000',clip:'missing-clip',component_id:'missing/id'});
  assert.equal(staleApply.result.isError,true);
  const invalidDraft=await call('text3d_create',{name:'../escape'});
  assert.equal(invalidDraft.result.isError,true);
  const invalid=await call('library_search',{kind:'invalid',query:'glow'});
  assert.equal(invalid.result.isError,true);
 }finally{
  if(child){child.kill();child.stdin.destroy()}
  await rm(root,{recursive:true,force:true});
 }
});
