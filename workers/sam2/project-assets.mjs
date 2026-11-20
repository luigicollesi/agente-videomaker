// Opt-in project asset adapter. It never writes into the original source asset.
import { realpath, lstat, mkdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join, extname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateSegmentRequest } from './contract.mjs';
import { segmentImage } from './runner.mjs';

const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff']);
const inside = (root, path) => {
  const rel = relative(root, path);
  return rel !== '' && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel);
};
async function confinedFile(root, rel) {
  if (typeof rel !== 'string' || !rel.trim() || isAbsolute(rel)) throw new TypeError('Expected relative asset path');
  const full = resolve(root, rel);
  if (!inside(root, full)) throw new Error('Asset path outside project');
  const canonical = await realpath(full);
  if (!inside(root, canonical)) throw new Error('Asset symlink outside project');
  const stat = await lstat(canonical);
  if (!stat.isFile()) throw new Error('Asset is not a file');
  return canonical;
}
/**
 * Resolve an existing project image; project assets are expected under assets/.
 * The returned paths are private runtime paths, not an MCP public input contract.
 */
export async function resolveProjectImage(projectRoot, assetRelativePath) {
  const root = await realpath(projectRoot);
  const assets = await realpath(join(root, 'assets'));
  if (!inside(root, assets)) throw new Error('Asset folder outside project');
  const source = await confinedFile(assets, assetRelativePath);
  if (!IMAGES.has(extname(source).toLowerCase())) throw new Error('Unsupported image format');
  return { root, source };
}
/**
 * Creates a fresh job directory below .film/roto; no existing outputs are overwritten.
 * Caller owns lifetime and cleanup of the returned job directory.
 */
export async function prepareImageJob(projectRoot, assetRelativePath, checkpoint, prompt) {
  const { root, source } = await resolveProjectImage(projectRoot, assetRelativePath);
  const model = await realpath(checkpoint);
  if (!(await lstat(model)).isFile()) throw new Error('Checkpoint is not a file');
  const film = join(root, '.film');
  await mkdir(film, { recursive: true });
  const filmRoot = await realpath(film);
  if (!inside(root, filmRoot)) throw new Error('Runtime folder outside project');
  const jobsRoot = join(filmRoot, 'roto');
  await mkdir(jobsRoot, { recursive: true });
  const canonicalJobs = await realpath(jobsRoot);
  if (!inside(filmRoot, canonicalJobs)) throw new Error('Rotoscope folder outside runtime');
  const id = randomUUID();
  const folder = join(canonicalJobs, id);
  await mkdir(folder, { recursive: false });
  const request = validateSegmentRequest({
    input: source, checkpoint: model,
    outputMask: join(folder, 'mask.png'),
    outputRgba: join(folder, 'foreground.png'),
    ...prompt,
  });
  return { id, folder, source, request };
}
export async function segmentProjectImage(args, options) {
  const job = await prepareImageJob(args.projectRoot, args.assetRelativePath, args.checkpoint, args.prompt);
  const result = await segmentImage(job.request, options);
  return { id: job.id, source: job.source, folder: job.folder, ...result };
}
