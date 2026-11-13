import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { createText3DMotion, text3DEnvelope, text3DGraphemes } from './openfilm-text3d-runtime.mjs';

/** Reference implementation of the Text3DComponent v1 contract. */
export async function createText3D({ canvas, element, root }) {
  const renderer = new THREE.WebGLRenderer({
    canvas, alpha: true, antialias: true, preserveDrawingBuffer: true
  });
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, canvas.width / canvas.height, .1, 100);
  camera.position.set(0, 0, 5.2);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.8);
  key.position.set(-2, 4, 6);
  scene.add(key);

  const group = new THREE.Group();
  scene.add(group);
  const characters = [];
  const front = new THREE.MeshStandardMaterial({
    color: 0xdae9ff, metalness: .28, roughness: .35
  });
  const side = new THREE.MeshStandardMaterial({
    color: 0x577eae, metalness: .4, roughness: .5
  });
  const font = await new FontLoader().loadAsync('./vendor/fonts/helvetiker_regular.typeface.json');
  let text = '';
  let currentDepth = NaN;
  let currentEvents = '';
  let motion;

  function rebuild(nextText, depth) {
    for (const old of characters) {
      group.remove(old);
      old.traverse(child => {
        if (child.geometry) child.geometry.dispose();
      });
    }
    characters.length = 0;
    let cursor = 0;
    for (const character of text3DGraphemes(nextText)) {
      const wrapper = new THREE.Group();
      const geometry = new TextGeometry(character, {
        font, size: .43, depth, curveSegments: 12,
        bevelEnabled: true, bevelThickness: .018,
        bevelSize: .012, bevelSegments: 3
      });
      geometry.computeBoundingBox();
      const width = geometry.boundingBox ?
        geometry.boundingBox.max.x - geometry.boundingBox.min.x : .22;
      const mesh = new THREE.Mesh(geometry, [front, side]);
      mesh.position.set(-geometry.boundingBox?.min.x || 0, -.14, 0);
      wrapper.add(mesh);
      wrapper.position.x = cursor;
      characters.push(wrapper);
      group.add(wrapper);
      cursor += Math.max(.15, width) + .055;
    }
    group.position.x = -cursor / 2;
    motion = createText3DMotion({ group, characters });
    text = nextText;
    currentDepth = depth;
  }

  function value(css, name, fallback) {
    const parsed = parseFloat(css.getPropertyValue(name));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  function parseEvents(raw) {
    let source = raw.trim();
    if (source.startsWith("'") && source.endsWith("'")) source = source.slice(1, -1);
    const events = JSON.parse(source || '[]');
    if (!Array.isArray(events)) throw new Error('Text3D motion events must be an array');
    return events;
  }

  async function frame(t) {
    const css = getComputedStyle(root);
    const nextText = element.textContent || ' ';
    const depth = Math.max(.01, Math.min(1, value(css, '--text3d-depth', .14)));
    if (nextText !== text || depth !== currentDepth) rebuild(nextText, depth);
    const events = css.getPropertyValue('--text3d-events');
    if (events !== currentEvents) {
      motion.setMotion(parseEvents(events));
      currentEvents = events;
    }
    front.color.set(css.getPropertyValue('--text3d-color').trim() || '#dae9ff');
    side.color.copy(front.color).multiplyScalar(.48);
    await motion.frame(t);
    const length = value(css, '--clip-length', 10);
    const entrance = value(css, '--text3d-in', 1);
    const exit = value(css, '--text3d-out', 1);
    const envelope = text3DEnvelope(t, length, entrance, exit);
    group.scale.multiplyScalar(envelope);
    renderer.render(scene, camera);
  }

  await frame(0);
  return {
    group, characters,
    frame,
    dispose() {
      for (const child of characters) child.traverse(obj => obj.geometry?.dispose());
      front.dispose();
      side.dispose();
      renderer.dispose();
    }
  };
}
