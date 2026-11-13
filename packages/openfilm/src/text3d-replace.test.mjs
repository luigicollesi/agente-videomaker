import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replacementEdits} from './text3d-replace.mjs';
const clip={id:'c1',src:'original.html',time:[2,8],attrs:{'data-props':JSON.stringify([{name:'Text',type:'text',at:'.word'},{name:'Color',type:'var',var:'--color'}])},overrides:[{at:'.word',text:'HELLO'},{at:':root',style:{'--color':'#ffaa00','--clip-length':'6s'}},{fade:[.2,.3]}]};
const target={src:'other.html',attrs:{'data-props':JSON.stringify([{name:'Text',type:'text',at:'.t'},{name:'Color3D',type:'var',var:'--front'}])}};
test('CLI replacement maps parameters and retains faded frame timing',()=>{
 const edits=replacementEdits(clip,target,{Text:'Text',Color:'Color3D'});
 assert.deepEqual(edits.find(x=>x.prop==='time').value,[0,6]);
 const overrides=edits.find(x=>x.prop==='overrides').value;
 assert.ok(overrides.some(x=>x.at==='.t'&&x.text==='HELLO'));
 assert.ok(overrides.some(x=>x.at===':root'&&x.style['--front']==='#ffaa00'));
 assert.ok(overrides.some(x=>x.fade?.[0]===.2));
});
test('CLI replacement rejects unmapped variables',()=>{
 assert.throws(()=>replacementEdits(clip,target,{Text:'Text'}),/Missing Text3D mapping/);
});
