import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveProjectImage, prepareImageJob, segmentProjectImage } from './project-assets.mjs';

async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'roto-assets-'));
  try {
    await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'assets', 'subject.png'), 'placeholder');
    await writeFile(join(root, 'weights.pt'), 'placeholder');
    await fn(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
test('resolves existing image without modifying it', async () => fixture(async root => {
  const a = await resolveProjectImage(root, 'subject.png');
  assert.equal(a.source, join(root, 'assets', 'subject.png'));
}));
test('rejects path traversal and unsupported media', async () => fixture(async root => {
  await assert.rejects(resolveProjectImage(root, '../weights.pt'));
  await writeFile(join(root, 'assets', 'audio.mp3'), 'placeholder');
  await assert.rejects(resolveProjectImage(root, 'audio.mp3'), /Unsupported/);
}));
test('rejects symlink pointing outside assets', async () => fixture(async root => {
  await symlink(join(root, 'weights.pt'), join(root, 'assets', 'escape.png'));
  await assert.rejects(resolveProjectImage(root, 'escape.png'), /outside project/);
}));
test('creates isolated job outputs under .film', async () => fixture(async root => {
  const job = await prepareImageJob(root, 'subject.png', join(root, 'weights.pt'), {box:[0,0,10,10]});
  assert.ok(job.request.outputMask.startsWith(join(root, '.film', 'roto')));
  assert.notEqual(job.request.outputMask, job.source);
}));

test('caller cannot override internal source or output paths', async () => fixture(async root => {
  const job = await prepareImageJob(root, 'subject.png', join(root, 'weights.pt'), {
    box: [0,0,10,10], input: '/tmp/elsewhere.png', outputMask: '/tmp/unsafe.png'
  });
  assert.equal(job.source, join(root, 'assets', 'subject.png'));
  assert.ok(job.request.outputMask.startsWith(join(root, '.film', 'roto')));
}));

test('failed worker removes only its own job directory and preserves source', async () => fixture(async root => {
  const source = join(root, 'assets', 'subject.png');
  const before = await readFile(source);
  await assert.rejects(segmentProjectImage({
    projectRoot: root, assetRelativePath: 'subject.png',
    checkpoint: join(root, 'weights.pt'), prompt: {box:[0,0,10,10]}
  }, { python: '/missing/roto-python-not-installed' }), /ENOENT/);
  assert.deepEqual(await readdir(join(root, '.film', 'roto')), []);
  assert.deepEqual(await readFile(source), before);
}));
