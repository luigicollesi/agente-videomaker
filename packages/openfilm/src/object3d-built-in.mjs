/**
 * The first built-in Object3D component is generated on first access from the
 * same source as the CLI/MCP demo. This avoids duplicating Three.js vendor
 * bundles in Git and makes the normal Saved/library clip pipeline reusable.
 */
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createObject3DDemo } from './object3d-demo.mjs';

export const OBJECT3D_BUILTIN_ID = 'object3d/cube';
const VERSION = 'scene3d-cube-1';
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
export const OBJECT3D_BUILTIN = Object.freeze({
  id: OBJECT3D_BUILTIN_ID, name: '3D Cube', type: 'procedural',
  category: 'object3d', parts: ['demo-cube'], materials: ['cube-material'],
  path: 'openfilm/object3d/cube', ready: true, editable: true,
  editableProperties: ['color','roughness','metalness']
});
export const isObject3DBuiltInFile = rel =>
  rel === OBJECT3D_BUILTIN_ID || rel.startsWith(OBJECT3D_BUILTIN_ID + '/');

const complete = async folder => {
  if ((await readFile(join(folder, '.version'), 'utf8').catch(() => '')) !== VERSION) return false;
  const meta = await readFile(join(folder, 'saved.json'), 'utf8').then(JSON.parse).catch(() => null);
  const page = await stat(join(folder, 'files', 'index.html')).catch(() => null);
  return meta?.kind === 'clip' && meta.clip?.src === 'index.html' && page?.isFile() === true;
};
/** Build exclusively in the shared library cache; never write into source/library or projects. */
export async function ensureObject3DBuiltIn(cacheRoot) {
  if (typeof cacheRoot !== 'string' || !cacheRoot) throw Error('Object3D cache root is required');
  const parent = join(resolve(cacheRoot), 'object3d');
  const dest = join(parent, 'cube');
  if (await complete(dest)) return dest;
  // Cache is derivative but may be in use. Never replace an incomplete,
  // foreign or older bundle in place: fail safely instead.
  if ((await stat(dest).catch(e => { if (e.code === 'ENOENT') return null; throw e; }))) {
    throw Error('Object3D cached cube bundle is incomplete; inspect the cache before retrying');
  }
  await mkdir(parent, { recursive: true });
  const build = await mkdtemp(join(parent, '.cube-building-'));
  try {
    await createObject3DDemo(join(build, 'files'));
    await writeFile(join(build, 'saved.json'), JSON.stringify(META, null, 2) + '\n');
    await writeFile(join(build, '.version'), VERSION);
    try { await rename(build, dest); }
    catch (e) {
      if (['EEXIST', 'ENOTEMPTY'].includes(e?.code) && await complete(dest)) return dest;
      throw e;
    }
    return dest;
  } finally { await rm(build, { recursive: true, force: true }); }
}
