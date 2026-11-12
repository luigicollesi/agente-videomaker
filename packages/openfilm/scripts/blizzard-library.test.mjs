import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const library = new URL('../library/', import.meta.url);
const source = (file) => readFileSync(new URL(file, library));

test('Blizzard V2 receives overrides before each frame', () => {
  const html = source('text/text-blizzard-frost-shatter-v2/files/blizzard-frost-shatter.html').toString('utf8');
  assert.match(html, /frameReadsOverrides\s*:\s*true/);
  assert.match(html, /frame\(t\)\s*\{\s*refresh\(\);\s*draw\(t\)/);
  for (const name of ['--clip-length', '--blizzard-in', '--blizzard-out']) assert.ok(html.includes(name), name);
});

test('Blizzard V2 exposes total, appearance and exit controls, no independent hold control', () => {
  const saved = JSON.parse(source('text/text-blizzard-frost-shatter-v2/saved.json').toString('utf8'));
  const props = JSON.parse(saved.clip.attrs['data-props']);
  const vars = props.filter((prop) => prop.type === 'var').map((prop) => prop.var);
  for (const name of ['--clip-length', '--blizzard-in', '--blizzard-out']) assert.ok(vars.includes(name), name);
  assert.equal(vars.includes('--blizzard-hold'), false);
  assert.deepEqual(saved.clip.time, [0, 7]);
});

test('active Blizzard V2 bundle has static and animated preview assets', () => {
  const index = JSON.parse(source('index.json').toString('utf8'));
  const ids = index.items.map((item) => item.id);
  assert.equal(ids.filter((id) => id === 'text/text-blizzard-frost-shatter-v2').length, 1);
  assert.equal(ids.includes('text/text-blizzard-frost-shatter'), false);
  assert.match(source('text/text-blizzard-frost-shatter-v2/poster.svg').toString('utf8'), /<svg/);
  const mp4 = source('text/text-blizzard-frost-shatter-v2/preview.mp4');
  assert.equal(mp4.toString('ascii', 4, 8), 'ftyp');
});
