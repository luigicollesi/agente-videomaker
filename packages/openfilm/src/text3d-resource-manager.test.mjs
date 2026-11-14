import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Text3DResourceManager} from './text3d-resource-manager.mjs';
test('shared resources survive until last owner and are disposed once',()=>{
 const m=new Text3DResourceManager();let count=0;
 const resource={dispose(){count++}};
 m.track('one',resource);m.track('two',resource);
 m.release('one');assert.equal(count,0);
 m.release('two');m.releaseAll();assert.equal(count,1);
});
test('resource cleanup continues when one disposal fails',()=>{
 const m=new Text3DResourceManager();let cleaned=false;
 m.track('effect',{dispose(){throw Error('fail')}});
 m.track('effect',{dispose(){cleaned=true}});
 assert.throws(()=>m.release('effect'),AggregateError);
 assert.equal(cleaned,true);
});
