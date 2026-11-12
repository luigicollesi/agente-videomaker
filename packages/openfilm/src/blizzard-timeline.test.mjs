import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { open } from './shared.mjs';
import { filmHtml } from './film-doc.mjs';

const source = new URL('../library/text/text-blizzard-frost-shatter-v3/files/blizzard-frost-shatter-unbounded.html', import.meta.url);

test('Blizzard V3 player receives late frames on an extended real timeline clip', { timeout: 120_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'of-blizzard-timeline-'));
  let session;
  try {
    const original = readFileSync(source, 'utf8');
    const instrument = '<script>window.__blizzardTimes=[];const old=window.film.frame;window.film.frame=t=>{window.__blizzardTimes.push(t);return old(t)};</script>';
    writeFileSync(join(dir, 'blizzard.html'), original.replace('</body>', instrument+'</body>'));
    const clip = (length, start = 0) => ({
      id:'blizzard', src:'blizzard.html',time:[start,length],
      attrs:{'data-props':JSON.stringify([
        {name:'Entrance time',type:'var',var:'--blizzard-in'},
        {name:'Exit time',type:'var',var:'--blizzard-out'},
        {name:'Clip length (managed by timeline)',type:'var',var:'--clip-length'}])},
      overrides:[{at:':root',style:{'--clip-length':length+'s','--blizzard-in':'2','--blizzard-out':'3'}}],
    });
    const project = (length,start=0) => ({stage:{w:440,h:235},tracks:[{clips:[clip(length,start)]}]});
    writeFileSync(join(dir,'film.html'),filmHtml(project(10.5)));
    session = await open(dir);
    const inspect = () => session.film.page.evaluate(() => {
      const win=document.querySelector('iframe')?.contentWindow;
      return { t:win?.__blizzardTimes?.at(-1),native:win?.film?.duration,
        params:win?.blizzard?.getParams() };
    });
    for(const [length,hold] of [[10.5,5.5],[20,15],[8,3]]) {
      if(length!==10.5) assert.equal(await session.film.page.evaluate(v=>window.__filmEditor.update(v),project(length)),true);
      const t=length===20?19:length-1;
      await session.film.seek(t);
      const actual=await inspect();
      assert.equal(actual.native,undefined,'must not declare native duration');
      assert.ok(Math.abs(actual.t-t)<.01,'player delivered wrong source time: '+JSON.stringify(actual));
      assert.equal(actual.params.duration,length);
      assert.equal(actual.params.entry,2);
      assert.equal(actual.params.exit,3);
      assert.equal(actual.params.hold,hold);
    }
    assert.equal(await session.film.page.evaluate(v=>window.__filmEditor.update(v),project(20,10)),true);
    await session.film.seek(9);
    const trimmed=await inspect();
    assert.ok(Math.abs(trimmed.t-19)<.01,'trimmed player did not use source clock: '+JSON.stringify(trimmed));
    assert.equal(trimmed.params.outStart*trimmed.params.duration,17);
  } finally {
    if(session) await session.close();
    rmSync(dir,{recursive:true,force:true});
  }
});
