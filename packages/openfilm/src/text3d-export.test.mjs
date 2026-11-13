import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cp,mkdir,mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {filmHtml} from './film-doc.mjs';
import {render} from './render.mjs';
import {text3DCommand} from './text3d-cli.mjs';

const ffmpeg=spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0;
const fixture=fileURLToPath(new URL('../examples/text3d-sample/',import.meta.url));
test('Text3D vector page is exportable through the actual OpenFilm MP4 renderer',{timeout:120_000,skip:!ffmpeg},async()=>{
 const temp=await mkdtemp(join(tmpdir(),'openfilm-text3d-export-'));
 const prior=process.env.OPENFILM_SAVED;
 process.env.OPENFILM_SAVED=join(temp,'Saved');
 try{
  const registration=await text3DCommand(['register',fixture]);
  assert.equal(registration.ok,true,registration.lines.join(' '));
  const filmRoot=join(temp,'Project');
  const source=join(temp,'Saved','text3d','text3d','sample','v1');
  const destination=join(filmRoot,'saved','text3d','text3d','sample','v1');
  await mkdir(join(destination,'..'),{recursive:true});
  await cp(source,destination,{recursive:true});
  await import('node:fs/promises').then(m=>m.writeFile(join(filmRoot,'film.html'),filmHtml({
   stage:{w:960,h:540},tracks:[{clips:[{
     id:'text3d',src:'saved/text3d/text3d/sample/v1/files/index.html',
     time:[0,2],attrs:{'data-props':JSON.stringify([{name:'Clip length',type:'var',var:'--clip-length'}])}
   }]}]
  })));
  const out=join(temp,'text3d.mp4');
  const result=await render([filmRoot,'0-0.6'],{workers:1,silent:true,hardware:false,out,onProgress(){}});
  assert.equal(result.out,out);
  assert.ok((await stat(out)).size>5000,'the exported MP4 must contain actual video frames');
  const probe=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_name','-of','csv=p=0',out],{encoding:'utf8'});
  assert.equal(probe.status,0,probe.stderr);
  assert.equal(probe.stdout.trim(),'h264');
 }finally{
  if(prior===undefined)delete process.env.OPENFILM_SAVED;else process.env.OPENFILM_SAVED=prior;
  await rm(temp,{recursive:true,force:true});
 }
});
