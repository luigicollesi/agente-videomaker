import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { clipSpan, sourceAt } from '../../src/film-doc.mjs';

const root = join(import.meta.dirname, '../../library');
const index = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'));
const modes = ['forge', 'letters', 'ash', 'combined'];

for (const mode of modes) {
  test(`text-burn-${mode}: timeline-driven, self-contained native bundle`, () => {
    const id = `text/text-burn-${mode}`;
    const entry = index.items.find(x => x.id === id);
    assert.ok(entry, 'catalog entry exists');
    assert.equal(entry.cat, 'text');
    assert.equal(entry.kind, 'page');
    assert.equal(entry.group, 'burn');
    const dir = join(root, id);
    const saved = JSON.parse(readFileSync(join(dir, 'saved.json'), 'utf8'));
    assert.equal(saved.version, 2);
    assert.equal(saved.kind, 'clip');
    assert.equal(saved.clip.src, `text-burn-${mode}-timeline.html`);
    assert.equal(entry.src, saved.clip.src);
    assert.equal(saved.durationMs, mode === 'combined' ? 8000 : 3000);
    assert.deepEqual(saved.clip.time, [0, mode === 'combined' ? 8 : 3]);
    assert.ok(existsSync(join(root, entry.poster)));
    const props = JSON.parse(saved.clip.attrs['data-props']);
    assert.ok(props.some(x => x.type === 'text' && x.at === '.t'));
    for (const name of ['--burn-intensity', '--burn-stagger', '--burn-in-duration',
      '--burn-out-duration', '--burn-final-color', '--clip-length']) {
      assert.ok(props.some(x => x.var === name), `${mode} declares ${name}`);
    }
    assert.equal(props.filter(x => x.var === '--clip-length').length, 1);
    assert.ok(!props.some(x => ['--burn-clip-length', '--burn-duration'].includes(x.var)),
      'no manual total duration or legacy duration exposed in inspector');
    const html = readFileSync(join(dir, 'files', saved.clip.src), 'utf8');
    assert.match(html, /window\.film\s*=\s*\{frame,frameReadsOverrides:true\}/);
    assert.doesNotMatch(html, /window\.film\.duration|window\.film\s*=\s*\{[^}]*duration:/,
      'no native film.duration: the sourceAt native clamp must not freeze extended clips');
    assert.match(html, /getPropertyValue\(name\)/);
    assert.match(html, /clipLengthFromTimeline\(\)/);
    assert.match(html, /--clip-length:/);
    assert.doesNotMatch(html, /--burn-clip-length:/);
    assert.match(html, /new Intl\.Segmenter/);
    assert.match(html, /background:transparent/);
    assert.doesNotMatch(html, /https?:\/\//, 'no external asset dependency');
  });
}

test('all Text Burn presets: in/hold/out follows timeline and keeps exit anchored to end', () => {
  for (const mode of modes) {
    const entry = index.items.find(x => x.id === `text/text-burn-${mode}`);
    const file = readFileSync(join(root, 'text', `text-burn-${mode}`, 'files', entry.src), 'utf8');
    const match = file.match(/function burnTimeline\(t, clipLength, inDuration, outDuration\)\{[\s\S]*?\n\}/);
    assert.ok(match, `timing evaluator exists in ${mode}`);
    const fn = runInNewContext(match[0] + '; burnTimeline',
      { clamp: (x,a,b) => Math.max(a,Math.min(b,x)), Math, Number });
    const stage = (t, length, inn=2, out=3) => fn(t,length,inn,out).phase;
    // Resized clip. Explicit in/out lengths do not vary when the timeline grows.
    assert.equal(stage(0,20), 'in');
    assert.equal(stage(1.999,20), 'in');
    assert.equal(stage(2,20), 'hold');
    assert.equal(stage(16.999,20), 'hold');
    assert.equal(stage(17,20), 'out');
    assert.equal(stage(19.5,20), 'out');
    assert.equal(fn(20,20,2,3).clock, 3);
    assert.equal(stage(5,8), 'out');
    assert.equal(stage(4.999,8), 'hold');
    // Slower or faster phases change hold, never the end-of-clip exit anchor.
    assert.equal(stage(9,20,1,2), 'hold');
    assert.equal(stage(18,20,1,2), 'out');
    assert.equal(stage(9,20,8,2), 'hold');
    assert.equal(stage(10,20,8,2), 'hold');
    // Out wins if phases cannot both fit.
    assert.equal(stage(1.5,3,2,2), 'out');
    assert.equal(stage(0,3,0,2), 'hold');
    assert.equal(stage(0,3,2,0), 'in');
    assert.equal(stage(2.999,3,2,0), 'hold');
    assert.equal(fn(19.5,20,2,3).phase, fn(19.5,20,2,3).phase, 'absolute-time deterministic');
    // OpenFilm accepts stretched procedural pages when they have no native duration.
    const clip = { src: `saved/openfilm/text-text-burn-${mode}/${entry.src}`, time: [0,20] };
    const span = clipSpan(clip, undefined);
    assert.equal(sourceAt(span, 19, clip, undefined), 19);
    assert.equal(sourceAt(span, 19, clip, 8), 7.999,
      'regression: old native film.duration froze time before exit');
  }
});
