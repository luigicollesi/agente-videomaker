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

test('timeline owns clip-length and explicit duration is used by CLI and Studio',()=>{
 const withDuration={...clip,attrs:{'data-props':JSON.stringify([
  {name:'Text',type:'text',at:'.word'}, {name:'Color',type:'var',var:'--color'},
  {name:'Clip length',type:'var',var:'--clip-length'}
 ])}};
 const registered={...target,attrs:{...target.attrs,'data-text3d-source-id':'text/burn','data-text3d-version':'v2'}};
 const edits=replacementEdits(withDuration,registered,{Text:'Text',Color:'Color3D'},12);
 assert.deepEqual(edits.find(x=>x.prop==='time').value,[0,12]);
 assert.equal(edits.find(x=>x.prop==='attrs').value['data-text3d-version'],'v2');
 assert.equal(edits.find(x=>x.prop==='attrs').value['data-text3d-source-id'],'text/burn');
 const overrides=edits.find(x=>x.prop==='overrides').value;
 assert.equal(overrides.some(x=>x.at===':root'&&Object.hasOwn(x.style??{},'--clip-length')),false);
});
test('reject unknown visual override and invalid duration',()=>{
 const extra={...clip,overrides:[...clip.overrides,{at:'.unknown',style:{opacity:'0.5'}}]};
 assert.throws(()=>replacementEdits(extra,target,{Text:'Text',Color:'Color3D'}),/Unmapped clip override/);
 assert.throws(()=>replacementEdits(clip,target,{Text:'Text',Color:'Color3D'},0),/Invalid effective/);
});
