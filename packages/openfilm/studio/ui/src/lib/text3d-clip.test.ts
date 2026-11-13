import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isText3DClip, text3DEligibility, TEXT3D_MARK } from './text3d-clip';

test('existing Text 3D library asset is recognized by source and new assets by metadata', () => {
  assert.equal(isText3DClip({src:'saved/openfilm/text3d-text3d-motion/text3d-motion.html'}), true);
  assert.equal(isText3DClip({src:'saved/custom.html',attrs:{[TEXT3D_MARK]:'text3d'}}),true);
  assert.equal(isText3DClip({src:'saved/text-burn.html'}),false);
  assert.equal(isText3DClip(null),false);
});
test('geometry conversion remains disabled until a glyph adapter is implemented', () => {
  const html=text3DEligibility('text-burn.html',true);
  assert.equal(html.projection,true);
  assert.equal(html.geometry,false);
  assert.equal(text3DEligibility('movie.mp4',false).projection,false);
});
