import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {filmHtml} from '../../../packages/openfilm/src/film-doc.mjs';
import {auditFilm} from './mcp/film-audit.mjs';
import {projectPage,applyPageReplacements} from './mcp/project-pages.mjs';

test('P1 audit confirms 60-second explicit timeline without inventing native media duration',async()=>{
 const root=await mkdtemp(join(tmpdir(),'videomaker-p1-audit-'));
 try{
  await mkdir(join(root,'assets'));
  await writeFile(join(root,'scene.html'),'<html><script>window.film={frame(t){return t}};</script></html>');
  await writeFile(join(root,'assets','music.wav'),'fixture');
  const film={stage:{w:1920,h:1080},tracks:[
   {clips:[{id:'scene',src:'scene.html',at:0,time:[0,60]}]},
   {clips:[{id:'music',src:'assets/music.wav',at:0,time:[0,60],speed:1}]}
  ]};
  const valid=await auditFilm(root,film,'0123456789abcdef',60);
  assert.equal(valid.duration_seconds,60);
  assert.equal(valid.duration_confirmed,true);
  assert.equal(valid.expected_duration_matches,true);
  assert.deepEqual(valid.problems,[]);
  const uncertain=await auditFilm(root,{...film,tracks:[{clips:[{id:'unknown',src:'assets/music.wav',at:0}]}]},'0123456789abcdef',60);
  assert.equal(uncertain.duration_seconds,null);
  assert.equal(uncertain.expected_duration_matches,null);
  assert.equal(uncertain.unknown_durations.length,1);
  const missing=await auditFilm(root,{...film,tracks:[{clips:[{id:'missing',src:'assets/gone.png',at:0,time:[0,2]}]}]},'0123456789abcdef',2);
  assert.equal(missing.duration_confirmed,false);
  assert.ok(missing.problems.some(p=>p.issue.includes('does not exist')));
 }finally{await rm(root,{recursive:true,force:true})}
});
test('P1 HTML update is linked, hash-guarded, refuses stale revisions, duplicate matches and locked tracks',async()=>{
 const root=await mkdtemp(join(tmpdir(),'videomaker-p1-pages-'));
 try{
  const html='<html><script>window.film={frame(t){return t}};</script><h1>PULSO</h1></html>';
  await writeFile(join(root,'scene.html'),html);
  await writeFile(join(root,'secret.html'),'private');
  await writeFile(join(root,'film.html'),filmHtml({stage:{w:320,h:180},tracks:[{clips:[{id:'main',src:'scene.html',at:0,time:[0,60]}]}]}));
  const initial=await projectPage(root,{action:'inspect',path:'scene.html'});
  assert.match(initial.sha256,/^[a-f0-9]{64}$/);
  assert.match(initial.film_revision,/^[a-f0-9]{16}$/);
  const changes=[{find:'<h1>PULSO</h1>',replace:'<h1>PULSO NEON</h1>'}];
  await assert.rejects(projectPage(root,{action:'replace',path:'scene.html',revision:'0000000000000000',expected_sha256:initial.sha256,changes}),/Film changed/);
  await assert.rejects(projectPage(root,{action:'replace',path:'scene.html',revision:initial.film_revision,expected_sha256:'0'.repeat(64),changes}),/Page changed/);
  const updated=await projectPage(root,{action:'replace',path:'scene.html',revision:initial.film_revision,expected_sha256:initial.sha256,changes});
  assert.equal(updated.status,'updated');
  assert.match(await readFile(join(root,'scene.html'),'utf8'),/PULSO NEON/);
  assert.equal((await stat(join(root,'scene.html'))).isFile(),true);
  await assert.rejects(projectPage(root,{action:'replace',path:'scene.html',revision:initial.film_revision,expected_sha256:initial.sha256,changes}),/Page changed/);
  await assert.rejects(projectPage(root,{action:'inspect',path:'secret.html'}),/referenced/);
  await assert.rejects(projectPage(root,{action:'inspect',path:'../private.html'}));
  assert.throws(()=>applyPageReplacements('PULSO PULSO',[{find:'PULSO',replace:'X'}]),/once/);
  await writeFile(join(root,'film.html'),filmHtml({stage:{w:320,h:180},tracks:[{locked:true,clips:[{id:'main',src:'scene.html',at:0,time:[0,60]}]}]}));
  const locked=await projectPage(root,{action:'inspect',path:'scene.html'});
  await assert.rejects(projectPage(root,{action:'replace',path:'scene.html',revision:locked.film_revision,expected_sha256:locked.sha256,changes:[{find:'PULSO NEON',replace:'PULSO'}]}),/locked/);
 }finally{await rm(root,{recursive:true,force:true})}
});
