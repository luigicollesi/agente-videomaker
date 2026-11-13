import {test} from 'node:test';
import assert from 'node:assert/strict';
import {text3DSourceId} from './text3d-source-id';
test('built-in text component retains a stable cross-project identity',async()=>{
 assert.equal(await text3DSourceId('saved/openfilm/text-burn/files/burn.html','project-a'),'text/burn');
 assert.equal(await text3DSourceId('saved/openfilm/text-burn/files/burn.html','project-b'),'text/burn');
});
test('local pages get stable project-scoped source identifiers',async()=>{
 const first=await text3DSourceId('titles/my text.html','proj-a');
 assert.equal(first,await text3DSourceId('titles/my text.html','proj-a'));
 assert.notEqual(first,await text3DSourceId('titles/my text.html','proj-b'));
 assert.match(first,/^project\/proj-a\/[0-9a-f]{32}$/);
});
