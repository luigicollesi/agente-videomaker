import test from 'node:test';
import assert from 'node:assert/strict';
import {toSourcePoint,toSourcePolygon,sourcePolygonBounds} from './selection-transform.mjs';
const source={width:1920,height:1080};
const frame={cx:250,cy:150,w:400,h:200,r:0};
test('central stage click maps to original source',()=>{
  assert.deepEqual(toSourcePoint({x:250,y:150},frame,source),[960,540]);
});
test('rotation uses Studio clockwise angle convention',()=>{
  const rotated={...frame,r:90};
  assert.deepEqual(toSourcePoint({x:250,y:50},rotated,source),[480,540]);
});
test('crop region maps into source pixels',()=>{
  assert.deepEqual(toSourcePoint({x:250,y:150},frame,source,
    {x:100,y:50,width:800,height:500}),[500,300]);
});
test('outside points do not create selections',()=>{
  assert.equal(toSourcePoint({x:0,y:0},frame,source),null);
});
test('rejects incorrect dimensions and source region',()=>{
  assert.throws(()=>toSourcePoint({x:250,y:150},{...frame,w:0},source));
  assert.throws(()=>toSourcePoint({x:250,y:150},frame,source,{x:-1,y:0,width:100,height:100}));
});
test('polygon bounds on original image are deterministic',()=>{
  const poly=toSourcePolygon([{x:150,y:100},{x:350,y:100},{x:350,y:200},{x:150,y:200}],frame,source);
  assert.deepEqual(sourcePolygonBounds(poly,source),[480,270,1441,811]);
});

test('partially outside polygons are rejected',()=>{
  const polygon=toSourcePolygon([{x:0,y:0},{x:350,y:100},{x:350,y:200}],frame,source);
  assert.equal(polygon,null);
  assert.equal(sourcePolygonBounds(polygon,source),null);
});
test('invalid polygons fail closed',()=>{
  assert.throws(()=>sourcePolygonBounds([[1,2],[3,4]],source));
  assert.throws(()=>sourcePolygonBounds([[1,2],[3,4],[2000,3]],source));
});
