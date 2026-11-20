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
 assert.ok(f[0].position.every((x,i)=>Math.abs(x-f.at(-1).position[i])<1e-9));
});
test('rejects invalid frames and orbit inputs',()=>{
 assert.throws(()=>validateCameraKeyframes([{time:0,position:[0,0,1],target:[0,0,0],fov:45},{time:0,position:[1,0,1],target:[0,0,0],fov:45}]));
 assert.throws(()=>orbitCameraKeyframes({radius:0}));
});

test('arrival easing belongs to destination marker and preserves endpoints',()=>{
 const a={time:0,position:[0,0,8],target:[0,0,0],fov:45};
 const b={time:8,position:[8,0,8],target:[0,0,0],fov:45,easing:'ease-in'};
 const start=cameraPoseAt([a,b],0),middle=cameraPoseAt([a,b],4),end=cameraPoseAt([a,b],8);
 assert.equal(start.position[0],0);
 assert.equal(middle.position[0],2);
 assert.equal(end.position[0],8);
 assert.deepEqual(cameraPoseAt([a,b],4),middle);
});
test('hold arrival retains previous camera until destination marker',()=>{
 const frames=[{time:0,position:[0,0,8],target:[0,0,0],fov:45},{time:5,position:[5,0,8],target:[1,0,0],fov:60,easing:'hold'}];
 assert.deepEqual(cameraPoseAt(frames,4.999),{position:[0,0,8],target:[0,0,0],fov:45});
 assert.deepEqual(cameraPoseAt(frames,5),{position:[5,0,8],target:[1,0,0],fov:60});
});
test('camera evaluation never mutates persisted marker values',()=>{
 const frames=[{time:0,position:[0,0,8],target:[0,0,0],fov:45},{time:8,position:[8,0,4],target:[0,0,0],fov:45}];
 const before=JSON.stringify(frames);
 const pose=cameraPoseAt(frames,4);
 pose.position[0]=999;
 assert.equal(JSON.stringify(frames),before);
 assert.equal(cameraPoseAt(frames,4).position[0],4);
});
test('invalid pose, ordering and nonfinite time fail closed',()=>{
 const valid={time:0,position:[0,0,8],target:[0,0,0],fov:45};
 assert.throws(()=>cameraPoseAt([valid],Number.NaN));
 assert.throws(()=>validateCameraKeyframes([{...valid,fov:180}]));
 assert.throws(()=>validateCameraKeyframes([valid,{...valid,time:-1}]));
 assert.throws(()=>validateCameraKeyframes([valid,{...valid,time:1,easing:'unknown'}]));
});
