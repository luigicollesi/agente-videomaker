import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildText3DConversion } from './text3d-conversion';

test('conversion plan preserves clip identity and effective duration',()=>{
 const result=buildText3DConversion(
  {id:'clip-7',src:'saved/original.html',at:9,time:[2,12],attrs:{'data-custom':'kept'}},
  {src:'saved/openfilm/text3d/text3d-motion.html',attrs:{'data-props':'[]'}},
  {depth:18,shadow:35,bevel:3,lighting:65},'HELLO'
 );
 assert.deepEqual(result.map(e=>e.prop),['src','time','attrs','overrides']);
 assert.ok(result.every(e=>e.clip==='clip-7'));
 assert.deepEqual(result.find(e=>e.prop==='time')?.value,[0,10]);
 const attrs=result.find(e=>e.prop==='attrs')?.value as Record<string,string>;
 assert.equal(attrs['data-custom'],'kept');
 assert.equal(attrs['data-text3d-original-src'],'saved/original.html');
});
test('invalid source cannot produce an edit',()=>{
 assert.throws(()=>buildText3DConversion({id:'x',src:'a.html',time:[0,5]},{src:'b.html',attrs:{}},{depth:1,shadow:1,bevel:1,lighting:1},'')); 
});
