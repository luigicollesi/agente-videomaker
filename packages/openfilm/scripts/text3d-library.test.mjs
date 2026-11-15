import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {clipSpan,sourceAt} from '../src/film-doc.mjs';
const base=new URL('../library/',import.meta.url);
const read=p=>readFileSync(new URL(p,base),'utf8');
const id='text3d/text3d-motion/';
test('Text3D has a timeline-controlled, unbounded page',()=>{
 const html=read(id+'files/text3d-motion.html');
 assert.match(html,/window\.film=\{frame,frameReadsOverrides:true\}/);
 assert.doesNotMatch(html,/window\.film\.duration|window\.film=\{duration/);
 const doc=JSON.parse(read(id+'saved.json'));
 assert.deepEqual(doc.clip.time,[0,10.5]);
 const vars=JSON.parse(doc.clip.attrs['data-props']).filter(p=>p.type==='var').map(p=>p.var);
 for(const name of ['--clip-length','--text3d-in','--text3d-out','--text3d-events'])assert.ok(vars.includes(name));
 for(const total of [8,10.5,20]){
  const clip={src:doc.clip.src,time:[0,total]};
  const span=clipSpan(clip,undefined);
  assert.equal(sourceAt(span,total-0.1,clip,undefined),total-0.1);
 }
});
test('Text3D bundle is registered only under the new library category',()=>{
 const catalog=JSON.parse(read('index.json'));
 assert.ok(Array.isArray(catalog.groups.text3d));
 const matches=catalog.items.filter(item=>item.id==='text3d/text3d-motion');
 assert.equal(matches.length,1);
 assert.equal(matches[0].cat,'text3d');
 assert.match(read(id+'poster.svg'),/<svg/);
});
