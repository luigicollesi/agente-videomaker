import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planText3DApply} from './text3d-apply';
const source=()=>({
 id:'clip-1',src:'saved/openfilm/text-burn/files/burn.html',time:[2,8],
 attrs:{'data-link':'voice-1','data-props':JSON.stringify([
  {name:'Text',type:'text',at:'.title'},
  {name:'Fire Color',type:'var',var:'--fire-color'},
  {name:'Clip length',type:'var',var:'--clip-length'}
 ])},
 overrides:[{at:'.title',text:'HELLO'},{at:':root',style:{'--fire-color':'#ef3300','--clip-length':'6s'}},{fade:[.2,.3]}]
});
const target=()=>({
 id:'saved-template',src:'saved/text3d/burn/v1/files/index.html',
 attrs:{'data-props':JSON.stringify([{name:'Text',type:'text',at:'.t'},{name:'Flame Color',type:'var',var:'--flame-color'}])},
 overrides:[]
});
const registry={componentId:'text3d/burn/v1',source2DId:'text/burn',displayName:'Burn 3D',version:'v1',bundlePath:'saved/text3d/burn/v1',parameterMap:{Text:'Text','Fire Color':'Flame Color'}};
test('existing Text3D preserves configured source text, colors, fades, link and effective timeline duration',()=>{
 const edits=planText3DApply(source(),target(),registry,6);
 const get=p=>edits.find(e=>e.prop===p)?.value;
 assert.deepEqual(get('time'),[0,6]);
 assert.equal(get('src'),target().src);
 assert.equal(get('attrs')['data-link'],'voice-1');
 assert.equal(get('attrs')['data-openfilm-content-type'],'text3d');
 const overrides=get('overrides');
 assert.equal(overrides.some(o=>o.at==='.t'&&o.text==='HELLO'),true);
 assert.equal(overrides.some(o=>o.at===':root'&&o.style?.['--flame-color']==='#ef3300'),true);
 assert.equal(overrides.some(o=>o.fade?.[0]===.2),true);
});
test('unmapped configured source parameter refuses replacement',()=>{
 const entry={...registry,parameterMap:{Text:'Text'}};
 assert.throws(()=>planText3DApply(source(),target(),entry,6),/No Text3D mapping/);
});
