import test from 'node:test';
import assert from 'node:assert/strict';
import { imagePointFromStage, imageBoxFromStage } from './selection-coordinates.mjs';
const frame = { x: 100, y: 50, width: 400, height: 200 };
const image = { width: 1920, height: 1080 };
test('maps click into source resolution', () => {
  assert.deepEqual(imagePointFromStage({x:300,y:150,frame,image}), [960,540]);
});
test('click outside the displayed image is ignored', () => {
  assert.equal(imagePointFromStage({x:99,y:150,frame,image}),null);
  assert.equal(imagePointFromStage({x:500,y:150,frame,image}),null);
});
test('maps drag selection regardless of direction', () => {
  const box = imageBoxFromStage({a:{x:200,y:100},b:{x:400,y:200},frame,image});
  assert.deepEqual(box,[480,270,1440,810]);
  assert.deepEqual(imageBoxFromStage({a:{x:400,y:200},b:{x:200,y:100},frame,image}),box);
});
test('clips a partly outside box and ignores fully outside box', () => {
  assert.deepEqual(imageBoxFromStage({a:{x:0,y:0},b:{x:200,y:100},frame,image}),[0,0,480,270]);
  assert.equal(imageBoxFromStage({a:{x:0,y:0},b:{x:99,y:49},frame,image}),null);
});
test('rejects invalid dimensions and zero-area selections', () => {
  assert.throws(()=>imagePointFromStage({x:110,y:60,frame:{...frame,width:0},image}));
  assert.throws(()=>imageBoxFromStage({a:{x:120,y:60},b:{x:120,y:80},frame,image}));
});
