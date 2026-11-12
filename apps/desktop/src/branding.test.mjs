import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DISPLAY_NAME, PRODUCT_NAME, FLAVORS } from './flavor.mjs';

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..');
const studio = join(desktop, '../../packages/openfilm/studio/ui');
const build = join(desktop, 'build');

test('user-facing identity is independent from existing storage identity', () => {
  assert.match(DISPLAY_NAME, /^Agente Videomaker/);
  assert.equal(PRODUCT_NAME, FLAVORS.release.productName);
  assert.equal(FLAVORS.release.bundleId, 'dev.openfilm.desktop');
});

test('HTML entrypoints display the rebranded product', () => {
  for (const path of [join(desktop, 'shell/index.html'), join(studio, 'index.html'),
    join(desktop, 'src/installing.html'), join(desktop, 'src/failed.html')]) {
    const html = readFileSync(path, 'utf8');
    assert.match(html, /<title>Agente Videomaker<\/title>/, path);
  }
});

test('desktop icon assets are present and structurally valid', () => {
  for (const name of ['icon.png', 'icon-dev.png', 'logo-1024.png']) {
    const data = readFileSync(join(build, name));
    assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', name);
    assert.equal(data.readUInt32BE(16), 1024, name);
    assert.equal(data.readUInt32BE(20), 1024, name);
  }
  const ico = readFileSync(join(build, 'icon.ico'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.ok(ico.readUInt16LE(4) >= 1);
  for (const name of ['icon.icns', 'icon-dev.icns']) {
    const data = readFileSync(join(build, name));
    assert.equal(data.subarray(0, 4).toString(), 'icns', name);
    assert.equal(data.readUInt32BE(4), data.length, name);
  }
});

test('brand colors are defined in the shared UI tokens', () => {
  const css = readFileSync(join(studio, 'src/globals.css'), 'utf8');
  assert.match(css, /--accent: #f04465;/);
  assert.match(css, /--bg-app: #09090c;/);
});
