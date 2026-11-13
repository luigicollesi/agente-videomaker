import {test} from 'node:test';import assert from 'node:assert/strict';import {buildGeometryHtml} from './text3d-geometry';
test('geometry page contains actual triangle mesh extrusion and frame contract',()=>{
 const html=buildGeometryHtml('HELLO');
 assert.match(html,/gl\.TRIANGLES/);
 assert.match(html,/vec3 a_normal/);
 assert.match(html,/quad\(\[l,b,front\]/);
 assert.match(html,/frameReadsOverrides:true/);
 assert.doesNotMatch(html,/window\.film\.duration/);
});
test('rejects empty and excessive glyph input',()=>{
 assert.throws(()=>buildGeometryHtml(''));
 assert.throws(()=>buildGeometryHtml('x'.repeat(121)));
});
