import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSegmentRequest, segmentArgs } from './contract.mjs';
import { segmentImage } from './runner.mjs';

const base = { input: '/tmp/input.png', checkpoint: '/tmp/model.pt', outputMask: '/tmp/mask.png' };
test('valid box request', () => {
  const r = validateSegmentRequest({ ...base, box: [0, 0, 100, 100] });
  assert.deepEqual(r.box, [0, 0, 100, 100]);
  assert.ok(segmentArgs(r).includes('--box'));
});
test('valid point prompt including negative points', () => {
  const r = validateSegmentRequest({ ...base, points: [[10, 11], [20, 21]], labels: [1, 0] });
  assert.deepEqual(JSON.parse(segmentArgs(r)[segmentArgs(r).indexOf('--labels') + 1]), [1, 0]);
});
test('rejects malformed coordinates', () => {
  assert.throws(() => validateSegmentRequest({ ...base, box: [0, 0, 0, 10] }));
  assert.throws(() => validateSegmentRequest({ ...base, points: [[NaN, 5]], labels: [1] }));
  assert.throws(() => validateSegmentRequest({ ...base, points: [[5, 5]], labels: [] }));
});
test('protects original and output paths', () => {
  assert.throws(() => validateSegmentRequest({ ...base, outputMask: base.input, box: [0, 0, 10, 10] }));
});
test('runner rejects invalid requests before launching python', async () => {
  await assert.rejects(segmentImage({ ...base }), /Provide box or points/);
});
test('runner respects already aborted requests', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(segmentImage({ ...base, box: [0, 0, 10, 10] }, { signal: controller.signal }));
});

test('rejects invalid python executable configuration', async () => {
  await assert.rejects(segmentImage({ ...base, box: [0, 0, 10, 10] }, { python: '' }), /Invalid Python executable/);
});
test('reports missing executable without starting a model', async () => {
  await assert.rejects(
    segmentImage({ ...base, box: [0, 0, 10, 10] }, { python: '/missing/roto-python-not-installed' }),
    /ENOENT/,
  );
});
test('rejects invalid timeout', async () => {
  await assert.rejects(segmentImage({ ...base, box: [0, 0, 10, 10] }, { timeoutMs: 0 }), /Invalid timeout/);
});
