import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { clipSpan, sourceAt } from '../src/film-doc.mjs';

const library = new URL('../library/', import.meta.url);
const base = 'text/text-blizzard-frost-shatter-v3/';
const read = (name) => readFileSync(new URL(name, library));
const html = read(base + 'files/blizzard-frost-shatter-unbounded.html').toString('utf8');
const saved = JSON.parse(read(base + 'saved.json').toString('utf8'));
const props = JSON.parse(saved.clip.attrs['data-props']);

test('Blizzard V3 has no native duration, and player sourceAt is unbounded', () => {
  assert.match(html, /window\.film\s*=\s*\{\s*frameReadsOverrides\s*:\s*true/);
  assert.doesNotMatch(html, /window\.film\.duration/);
  assert.doesNotMatch(html, /window\.film\s*=\s*\{\s*duration/);
  const clip = { src: saved.clip.src, time: [0, 20] };
  const span = clipSpan(clip, undefined);
  assert.equal(sourceAt(span, 19, clip, undefined), 19);
  assert.ok(sourceAt(span, 19, clip, 10.5) < 10.5);
});

test('library exposes only entrance and exit durations, clip length is host-managed', () => {
  const vars = props.filter(p => p.type === 'var').map(p => p.var);
  assert.ok(vars.includes('--clip-length'));
  assert.ok(vars.includes('--blizzard-in'));
  assert.ok(vars.includes('--blizzard-out'));
  assert.ok(!vars.includes('--blizzard-hold'));
  assert.ok(!vars.includes('--blizzard-duration'));
  assert.ok(props.some(p => p.var === '--clip-length' && /managed by timeline/i.test(p.name)));
  assert.deepEqual(saved.clip.time, [0, 10.5]);
  assert.equal(saved.durationMs, 10500);
});

test('8, 10.5, 20 second clips reach their source time without clamping', () => {
  for (const [total, hold] of [[8, 3], [10.5, 5.5], [20, 15]]) {
    const clip = { src: saved.clip.src, time: [0, total] };
    const span = clipSpan(clip, undefined);
    const entrance = 2, exit = 3;
    assert.equal(total - entrance - exit, hold);
    assert.equal(total - exit, total === 20 ? 17 : total - 3);
    assert.equal(sourceAt(span, total - .1, clip, undefined), total - .1);
  }
});

test('trim and split use absolute source clock; exit remains at source end', () => {
  for (const [from, to] of [[2, 20], [0, 10], [10, 20]]) {
    const clip = { src: saved.clip.src, time: [from, to] };
    const span = clipSpan(clip, undefined);
    assert.equal(sourceAt(span, 0, clip, undefined), from);
    assert.equal(sourceAt(span, to - from - .1, clip, undefined), to - .1);
    assert.equal(to - 3, span.to - 3);
  }
});

test('active catalog uses a new internal bundle to avoid stale copies', () => {
  const index = JSON.parse(read('index.json').toString('utf8'));
  assert.equal(index.items.filter(item => item.id === 'text/text-blizzard-frost-shatter-v3').length, 1);
  assert.equal(index.items.some(item => item.id === 'text/text-blizzard-frost-shatter-v2'), false);
  assert.equal(saved.clip.src, 'blizzard-frost-shatter-unbounded.html');
  assert.match(read(base + 'preview.html').toString('utf8'), /blizzard-frost-shatter-unbounded\.html/);
  assert.match(read(base + 'poster.svg').toString('utf8'), /<svg/);
  assert.equal(read(base + 'preview.mp4').toString('ascii', 4, 8), 'ftyp');
});
