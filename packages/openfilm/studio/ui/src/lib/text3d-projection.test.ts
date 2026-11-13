import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeProjectPage,buildProjectionHtml} from './text3d-projection';
test('projection accepts local project HTML only',()=>{
 assert.equal(safeProjectPage('saved/asset/files/original.html'),true);
 for(const src of ['../other.html','https://example.com/x.html','/root/x.html','foo?bar.html','foo" onclick="x.html','x.mp4']) assert.equal(safeProjectPage(src),false,src);
});
test('projection retains source offset and deterministic frame entrypoint',()=>{
 const page=buildProjectionHtml('saved/source/effect.html',2.5);
 assert.match(page,/offset=2.5/);
 assert.match(page,/frameReadsOverrides:true/);
 assert.match(page,/child\.film\.frame\(at\+offset\)/);
 assert.doesNotMatch(page,/window\.film\.duration/);
});
