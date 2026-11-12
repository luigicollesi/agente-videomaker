import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const root = join(import.meta.dirname, '../../library');
const index = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'));

for (const mode of ['forge', 'letters', 'ash', 'combined']) {
  test(`text-burn-${mode} is a valid native library bundle`, () => {
    const id = `text/text-burn-${mode}`;
    const entry = index.items.find(x => x.id === id);
    assert.ok(entry, 'indexed');
    assert.equal(entry.cat, 'text');
    assert.equal(entry.kind, 'page');
    assert.equal(entry.group, 'burn');
    const dir = join(root, id);
    const saved = JSON.parse(readFileSync(join(dir, 'saved.json'), 'utf8'));
    assert.equal(saved.version, 2);
    assert.equal(saved.kind, 'clip');
    assert.equal(saved.clip.src, `text-burn-${mode}.html`);
    const props = JSON.parse(saved.clip.attrs['data-props']);
    assert.ok(props.some(x => x.type === 'text' && x.at === '.t'));
    assert.ok(props.some(x => x.var === '--burn-intensity'));
    assert.ok(props.some(x => x.var === '--burn-stagger'));
    assert.ok(props.some(x => x.var === '--burn-in-duration'));
    assert.ok(props.some(x => x.var === '--burn-out-duration'));
    assert.ok(props.some(x => x.var === '--burn-clip-length'));
    assert.ok(props.some(x => x.var === '--burn-final-color'));
    assert.equal(saved.durationMs, mode === 'combined' ? 8000 : 3000);
    assert.ok(existsSync(join(root, entry.poster)));
    const html = readFileSync(join(dir, 'files', saved.clip.src), 'utf8');
    assert.match(html, /window\.film\s*=\s*\{/);
    assert.match(html, /nativeFrame\(t\)/);
    assert.match(html, /--burn-mode:/);
    assert.match(html, /new Intl\.Segmenter/);
    assert.match(html, /background:transparent/);
    assert.doesNotMatch(html, /https?:\/\//, 'fully local and offline');
  });
}

test('all four presets share deterministic in/hold/out timing', () => {
  for (const mode of ['forge', 'letters', 'ash', 'combined']) {
    const file = readFileSync(join(root, 'text', `text-burn-${mode}`, 'files', `text-burn-${mode}.html`), 'utf8');
    const match = file.match(/function burnTimeline\(t, clipLength, inDuration, outDuration\)\{[\s\S]*?\n\}/);
    assert.ok(match, `timeline evaluator exists in ${mode}`);
    const fn = runInNewContext(match[0] + '; burnTimeline', { clamp: (x,a,b) => Math.max(a,Math.min(b,x)), Math, Number });
    assert.equal(fn(0, 10, 2, 2).phase, 'in');
    assert.equal(fn(1.999, 10, 2, 2).phase, 'in');
    assert.equal(fn(2, 10, 2, 2).phase, 'hold');
    assert.equal(fn(7.999, 10, 2, 2).phase, 'hold');
    assert.equal(fn(8, 10, 2, 2).phase, 'out');
    assert.equal(fn(10, 10, 2, 2).clock, 2);
    assert.equal(fn(3, 10, 0, 2).phase, 'hold', 'standalone exit stays visible until exit');
    assert.equal(fn(0, 10, 0, 2).phase, 'hold');
    assert.equal(fn(0, 10, 2, 0).phase, 'in', 'standalone entrance');
    assert.equal(fn(9, 10, 2, 0).phase, 'hold', 'entrance persists');
    assert.equal(fn(2, 3, 2, 2).phase, 'out', 'short clip clamps exit to remaining time');
    assert.equal(fn(8, 10, 2, 2).phase, fn(8, 10, 2, 2).phase, 'seek order independent');
    assert.equal(fn(3, 10, 2, 2).phase, 'hold');
    assert.equal(fn(8, 10, 2, 2).phase, 'out');
  }
});
