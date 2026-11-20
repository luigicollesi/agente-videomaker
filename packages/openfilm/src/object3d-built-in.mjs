/**
 * Native Object3D primitives are generated locally on first access using the
 * existing Saved clip format. No new renderer, timeline flow or network API.
 */
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createObject3DDemo } from './object3d-demo.mjs';

// Preserve the previously shipped cube ID, cache version and source semantics.
export const OBJECT3D_BUILTIN_ID = 'object3d/cube';
const specs = [
  { id: 'object3d/cube', name: '3D Cube', shape: 'cube', version: 'scene3d-cube-1' },
  { id: 'object3d/sphere', name: '3D Sphere', shape: 'sphere', version: 'scene3d-sphere-1' }
];
const byId = new Map(specs.map(spec => [spec.id, spec]));
const EDITABLE_PROPS = [
  { name: 'Color', type: 'var', var: '--object3d-color' },
  { name: 'Roughness', type: 'var', var: '--object3d-roughness' },
  { name: 'Metalness', type: 'var', var: '--object3d-metalness' }
];
const META = {
  version: 2,
  kind: 'clip',
  clip: { src: 'index.html', time: [0, 8], attrs: {
    'data-openfilm-content-type': 'object3d',
    'data-props': JSON.stringify(EDITABLE_PROPS)
  } },
  durationMs: 8000
};
export const OBJECT3D_BUILTINS = Object.freeze(specs.map(spec => Object.freeze({
  id: spec.id, name: spec.name, type: 'procedural',
  category: 'object3d', parts: ['demo-' + spec.shape],
  materials: [spec.shape + '-material'],
  path: 'openfilm/' + spec.id, ready: true, editable: true,
  editableProperties: ['color', 'roughness', 'metalness']
})));
export const OBJECT3D_BUILTIN = OBJECT3D_BUILTINS[0];
export const getObject3DBuiltIn = id => OBJECT3D_BUILTINS.find(item => item.id === id) ?? null;
export const isObject3DBuiltInFile = rel =>
  typeof rel === 'string' && specs.some(spec => rel === spec.id || rel.startsWith(spec.id + '/'));

const complete = async (folder, version) => {
  if ((await readFile(join(folder, '.version'), 'utf8').catch(() => '')) !== version) return false;
  const meta = await readFile(join(folder, 'saved.json'), 'utf8').then(JSON.parse).catch(() => null);
  const page = await stat(join(folder, 'files', 'index.html')).catch(() => null);
  return meta?.kind === 'clip' && meta.clip?.src === 'index.html' && page?.isFile() === true;
};
/** Build in shared cache only; never replace an existing bundle or project clip. */
export async function ensureObject3DBuiltIn(cacheRoot, id = OBJECT3D_BUILTIN_ID) {
  const spec = byId.get(id);
  if (!spec) throw Error('Unknown native Object3D asset');
  if (typeof cacheRoot !== 'string' || !cacheRoot) throw Error('Object3D cache root is required');
  const parent = join(resolve(cacheRoot), 'object3d');
  const dest = join(parent, spec.shape);
  if (await complete(dest, spec.version)) return dest;
  if (await stat(dest).catch(e => { if (e.code === 'ENOENT') return null; throw e; }))
    throw Error('Object3D cached ' + spec.shape + ' bundle is incomplete; inspect the cache before retrying');
  await mkdir(parent, { recursive: true });
  const build = await mkdtemp(join(parent, '.' + spec.shape + '-building-'));
  try {
    await createObject3DDemo(join(build, 'files'), { shape: spec.shape });
    await writeFile(join(build, 'saved.json'), JSON.stringify(META, null, 2) + '\n');
    await writeFile(join(build, '.version'), spec.version);
    try { await rename(build, dest); }
    catch (e) {
      if (['EEXIST', 'ENOTEMPTY'].includes(e?.code) && await complete(dest, spec.version)) return dest;
      throw e;
    }
    return dest;
  } finally { await rm(build, { recursive: true, force: true }); }
}
