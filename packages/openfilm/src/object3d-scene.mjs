import { cameraPoseAt } from './object3d-camera.mjs';

const ID = /^[a-z][a-z0-9_-]{0,63}$/;
const positive = (v) => Number.isFinite(v) && v > 0;

/**
 * Opt-in Scene3D graph. Deliberately creates NO WebGLRenderer, DOM surface,
 * project writes, timeline transactions or Text3D overrides.
 * The existing Studio stage can adopt this scene in a later gated phase.
 */
export function createScene3D({ THREE, aspect = 16 / 9 } = {}) {
  if (!THREE?.Scene || !THREE?.Group || !THREE?.PerspectiveCamera ||
      !THREE?.Box3 || !THREE?.Vector3 || !positive(aspect)) {
    throw new Error('Scene3D requires Three.js and a positive viewport aspect');
  }
  const scene = new THREE.Scene();
  const content = new THREE.Group();
  content.name = 'VideoMaker.Scene3D';
  scene.add(content);
  const ambient = new THREE.AmbientLight(0xffffff, .6);
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(3, 5, 4);
  scene.add(ambient, key);
  const camera = new THREE.PerspectiveCamera(45, aspect, .1, 1000);
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);
  const nodes = new Map();
  let disposed = false;
  const active = () => { if (disposed) throw new Error('Scene3D disposed'); };
  const addObject = (id, node) => {
    active();
    if (typeof id !== 'string' || !ID.test(id) || !node?.isObject3D ||
        node === content || node.parent) {
      throw new Error('Invalid or already parented Scene3D object');
    }
    if (nodes.has(id)) throw new Error('Duplicate Scene3D object ID');
    content.add(node);
    nodes.set(id, node);
    return id;
  };
  const removeObject = (id) => {
    active();
    const node = nodes.get(id);
    if (!node) return false;
    content.remove(node);
    nodes.delete(id);
    return true;
  };
  const selectionBounds = (ids = []) => {
    active();
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) {
      throw new Error('Invalid Scene3D selection');
    }
    if (!ids.length) return null;
    content.updateMatrixWorld(true);
    const box = new THREE.Box3().makeEmpty();
    for (const id of new Set(ids)) {
      const node = nodes.get(id);
      if (!node) throw new Error('Unknown Scene3D selection: ' + id);
      box.expandByObject(node);
    }
    if (box.isEmpty()) return null;
    return {
      center: box.getCenter(new THREE.Vector3()).toArray(),
      size: box.getSize(new THREE.Vector3()).toArray()
    };
  };
  const frame = (time, keyframes) => {
    active();
    const pose = cameraPoseAt(keyframes, time);
    camera.position.fromArray(pose.position);
    camera.lookAt(...pose.target);
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    return pose;
  };
  const resize = (nextAspect) => {
    active();
    if (!positive(nextAspect)) throw new Error('Invalid Scene3D aspect');
    camera.aspect = nextAspect;
    camera.updateProjectionMatrix();
  };
  const dispose = () => {
    if (disposed) return;
    for (const node of nodes.values()) content.remove(node);
    nodes.clear();
    scene.clear();
    disposed = true;
    // GLB mesh geometry and material resources are owned by their asset provider.
  };
  return { scene, content, camera, addObject, removeObject, selectionBounds, frame, resize, dispose };
}
