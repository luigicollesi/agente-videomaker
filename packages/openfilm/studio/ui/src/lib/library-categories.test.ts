import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrangedCategories } from './library-categories.ts';

const ALL = ['media', 'skill', 'template', 'text', 'sticker'] as const;

test('the library\'s categories in the person\'s order: the media first and shown, new ones where OpenFilm has them', () => {
  assert.deepEqual(arrangedCategories(ALL, null).map((c) => c.id), ALL);
  const arranged = arrangedCategories(ALL, { order: ['sticker', 'media', 'skill', 'gone'], off: ['skill', 'media'] });
  /* the media first and on whatever is kept; one no longer there left out; template and text, not named, after skill */
  assert.deepEqual(arranged, [
    { id: 'media', on: true }, { id: 'sticker', on: true }, { id: 'skill', on: false }, { id: 'template', on: true }, { id: 'text', on: true },
  ]);
});

test('a saved order naming a category twice still shows it once', () => {
  const ids = arrangedCategories(ALL, { order: ['sticker', 'sticker', 'text'], off: [] }).map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.filter((id) => id === 'sticker').length, 1);
});

test('Object 3D appears next to Text 3D without changing saved category preferences',()=>{
 const all=['media','skill','text','text3d','object3d','sticker'] as const;
 const oldPrefs={order:['skill','text3d','sticker'],off:['sticker']};
 const snapshot=JSON.stringify(oldPrefs);
 const result=arrangedCategories(all,oldPrefs);
 assert.deepEqual(result.map(x=>x.id),['media','skill','text','text3d','object3d','sticker']);
 assert.equal(result.find(x=>x.id==='object3d')?.on,true);
 assert.equal(result.find(x=>x.id==='sticker')?.on,false);
 assert.equal(JSON.stringify(oldPrefs),snapshot);
});
