import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createScene3D } from './object3d-scene.mjs';

test('Scene3D is opt-in and never allocates another WebGL renderer', () => {
  const scene3d = createScene3D({ THREE });
  assert.equal(scene3d.content.parent, scene3d.scene);
  assert.equal(scene3d.camera.isPerspectiveCamera, true);
  assert.equal(scene3d.scene.children.filter(x => x.isLight).length, 2);
  assert.equal(Object.hasOwn(scene3d, 'renderer'), false);
  scene3d.dispose();
  scene3d.dispose();
  assert.throws(() => scene3d.resize(1), /disposed/);
});

test('selection pivot uses combined world-space bounds without moving objects', () => {
  const view = createScene3D({ THREE });
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const material = new THREE.MeshBasicMaterial();
  const left = new THREE.Mesh(geometry, material), right = new THREE.Mesh(geometry, material);
  right.position.x = 4;
  view.addObject('left', left);
  view.addObject('right', right);
  assert.deepEqual(view.selectionBounds(['left', 'right']).center, [2, 0, 0]);
  assert.deepEqual(view.selectionBounds(['left', 'right']).size, [6, 2, 2]);
  assert.deepEqual(view.selectionBounds(['right']).center, [4, 0, 0]);
  assert.equal(view.selectionBounds([]), null);
  assert.deepEqual(left.position.toArray(), [0, 0, 0]);
  assert.throws(() => view.addObject('left', new THREE.Group()), /Duplicate/);
  assert.throws(() => view.selectionBounds(['missing']), /Unknown/);
  assert.equal(view.removeObject('left'), true);
  assert.equal(left.parent, null);
  view.dispose();
  geometry.dispose(); material.dispose();
});

test('camera pose follows absolute time, including reverse seek and resize', () => {
  const view = createScene3D({ THREE, aspect: 16/9 });
  const keyframes = [
    { time: 0, position: [0, 0, 8], target: [0, 0, 0], fov: 45 },
    { time: 10, position: [10, 0, 8], target: [1, 0, 0], fov: 65 }
  ];
  const mid = view.frame(5, keyframes);
  assert.deepEqual(mid.position, [5, 0, 8]);
  assert.deepEqual(view.camera.position.toArray(), mid.position);
  assert.deepEqual(view.frame(0, keyframes).position, [0, 0, 8]);
  assert.deepEqual(view.frame(5, keyframes), mid);
  view.resize(4/3);
  assert.equal(view.camera.aspect, 4/3);
  view.dispose();
  assert.throws(() => view.frame(5, keyframes), /disposed/);
});
