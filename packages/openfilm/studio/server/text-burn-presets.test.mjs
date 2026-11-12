import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../../library');
const index = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'));

for (const mode of ['forge', 'letters', 'ash']) {
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
