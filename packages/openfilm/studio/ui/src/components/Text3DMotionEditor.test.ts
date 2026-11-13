import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeMotions, parseMotions } from './Text3DMotionEditor';

test('Text3D motion events round-trip through CSS custom property',()=>{
 const motions=[{id:'one',type:'rotate3d' as const,start:4,duration:1.25,axis:'y' as const,turns:1},{id:'two',type:'scale' as const,start:8,duration:.5,to:0.5}];
 assert.deepEqual(parseMotions(encodeMotions(motions)),motions);
});
test('Text3D invalid event payload is treated as empty',()=>{
 assert.deepEqual(parseMotions('invalid-json'),[]);
 assert.deepEqual(parseMotions('null'),[]);
 assert.deepEqual(parseMotions('[{"id":"bad","type":"rotate3d","start":0,"duration":0}]'),[]);
});
