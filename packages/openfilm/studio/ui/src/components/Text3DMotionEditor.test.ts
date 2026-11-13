import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeMotions, parseMotions } from '../lib/text3d-motion';

test('motion events survive CSS serialization, including escaped content', () => {
  const list = [
    {id:'spin-a',type:'rotate3d' as const,start:4,duration:1.25,axis:'y' as const,turns:2},
    {id:'scale-b',type:'scale' as const,start:8,duration:.75,to:0.5},
    {id:'move-c',type:'translate3d' as const,start:9,duration:1,x:25,y:-10,z:80}
  ];
  assert.deepEqual(parseMotions(encodeMotions(list)),list);
});
test('invalid and duplicated events are ignored', () => {
  assert.deepEqual(parseMotions('garbage'),[]);
  const raw=JSON.stringify([{id:'x',type:'rotate3d',start:0,duration:1,axis:'y',turns:1},{id:'x',type:'rotate3d',start:1,duration:1,axis:'x',turns:1},{id:'z',type:'scale',start:0,duration:-1,to:2}]);
  assert.equal(parseMotions(raw).length,1);
});
