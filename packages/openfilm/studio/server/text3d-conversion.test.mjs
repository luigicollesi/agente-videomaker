import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyOps} from './ops.mjs';

const old = {
  id:'text-1',src:'saved/original.html',at:12,time:[2,12],
  attrs:{'data-props':'[]','data-keep':'yes'},
  overrides:[{at:':root',style:{'--existing':'1'}}],
  box:{x:100,y:240,w:800,h:200}
};
const base=()=>({stage:{w:1920,h:1080},tracks:[{clips:[structuredClone(old)]}]});
const value=()=>({src:'saved/openfilm/text3d/text3d-motion.html',
  time:[0,10],attrs:{
    ...old.attrs,'data-openfilm-content-type':'text3d','data-text3d-version':'1',
    'data-text3d-original-src':old.src
  },
  overrides:[{at:'.t',text:'HELLO'},{at:':root',style:{'--text3d-depth':'18'}}]});
const updates=Object.entries(value()).map(([prop,value])=>({clip:old.id,prop,value}));
test('Text3D replacement remains a single atomic props operation, retaining track, position and box',()=>{
 const changed=applyOps(base(),[{op:'props',edits:updates}]);
 const current=changed.tracks[0].clips[0];
 assert.equal(current.id,old.id);
 assert.equal(current.at,12);
 assert.deepEqual(current.box,old.box);
 assert.deepEqual(current.time,[0,10]);
 assert.equal(current.attrs['data-text3d-original-src'],old.src);
 assert.equal(changed.tracks.length,1);
});
test('Text3D conversion has an exact inverse as one undo step and can be redone',()=>{
 const original=base();
 const converted=applyOps(original,[{op:'props',edits:updates}]);
 const inverse=Object.keys(value()).map(prop=>({clip:old.id,prop,value:old[prop]}));
 const restored=applyOps(converted,[{op:'props',edits:inverse}]);
 assert.deepEqual(restored,original);
 const redone=applyOps(restored,[{op:'props',edits:updates}]);
 assert.deepEqual(redone,converted);
});
