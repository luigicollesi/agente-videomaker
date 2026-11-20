import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraPoseAt,orbitCameraKeyframes,validateCameraKeyframes} from './object3d-camera.mjs';
test('absolute-time camera interpolation is deterministic and seekable',()=>{
 const frames=[{time:0,position:[0,0,5],target:[0,0,0],fov:45},{time:10,position:[10,0,5],target:[1,0,0],fov:65}];
 assert.equal(validateCameraKeyframes(frames),true);
 assert.deepEqual(cameraPoseAt(frames,5),{position:[5,0,5],target:[.5,0,0],fov:55});
 assert.deepEqual(cameraPoseAt(frames,5),cameraPoseAt(frames,5));
 assert.deepEqual(cameraPoseAt(frames,-1).position,[0,0,5]);
 assert.deepEqual(cameraPoseAt(frames,11).position,[10,0,5]);
});
test('orbit returns circular path of constant radius with stable target',()=>{
 const f=orbitCameraKeyframes({radius:4,duration:8});
 assert.ok(f.length>=9);
 for(const p of f)assert.ok(Math.abs(Math.hypot(...p.position)-4)<1e-10);
 assert.deepEqual(f[0].target,[0,0,0]);
 assert.deepEqual(f[0].position.map(x=>Math.round(x*1e9)),f.at(-1).position.map(x=>Math.round(x*1e9)));
});
test('rejects invalid frames and orbit inputs',()=>{
 assert.throws(()=>validateCameraKeyframes([{time:0,position:[0,0,1],target:[0,0,0],fov:45},{time:0,position:[1,0,1],target:[0,0,0],fov:45}]));
 assert.throws(()=>orbitCameraKeyframes({radius:0}));
});
