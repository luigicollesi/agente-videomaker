import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { boardActionArgs } from './mcp/canvas-boards.mjs';
import { captionActionArgs, captionActions } from './mcp/caption-actions.mjs';

test('Canvas board writes require valid names, revisions and deletion confirmation',()=>{
 assert.equal(boardActionArgs({action:'create',name:'Storyboard'}).action,'create');
 assert.equal(boardActionArgs({action:'rename',board:'main',revision:'0123456789abcdef',name:'Intro'}).name,'Intro');
 assert.throws(()=>boardActionArgs({action:'rename',board:'main',name:'Intro'}),/revision/);
 assert.throws(()=>boardActionArgs({action:'create',name:' '.repeat(20)}),/name/i);
 assert.throws(()=>boardActionArgs({action:'delete',board:'main',revision:'0123456789abcdef'}),/confirmation/);
 assert.equal(boardActionArgs({action:'delete',board:'main',revision:'0123456789abcdef',confirm_delete:true}).action,'delete');
 assert.throws(()=>boardActionArgs({action:'delete',board:'../secret',revision:'0123456789abcdef',confirm_delete:true}));
});
test('Caption provider operations require explicit prior approval and bounded inputs',()=>{
 assert.throws(()=>captionActionArgs('captions_transcribe',{srcs:['assets/voice.wav'],external_approved:false}),/approval/);
 assert.throws(()=>captionActionArgs('captions_transcribe',{srcs:['a','b','c','d'],external_approved:true}),/approval/);
 assert.equal(captionActionArgs('captions_transcribe',{srcs:['assets/voice.wav'],external_approved:true}).srcs.length,1);
 assert.throws(()=>captionActionArgs('captions_translate',{language:'en',external_approved:false}),/approval/);
 assert.equal(captionActionArgs('captions_translate',{language:'en',external_approved:true}).language,'en');
 assert.throws(()=>captionActionArgs('caption_tracks',{action:'translate',src:'../../secrets.vtt',language:'en',external_approved:true}));
 assert.throws(()=>captionActionArgs('caption_tracks',{action:'new',name:'captions',text:'x'.repeat(40001)}));
 assert.equal(captionActionArgs('caption_tracks',{action:'from_subtitles',clips:['clip-a']}).action,'from_subtitles');
 assert.throws(()=>captionActionArgs('caption_track_cues',{src:'assets/private.vtt'}));
});
test('Read a bounded page of existing WebVTT captions without the whole file',async()=>{
 const root=await mkdtemp(join(tmpdir(),'videomaker-mcp-vtt-'));
 try{
  await mkdir(join(root,'captions'));
  await writeFile(join(root,'captions','test.vtt'),'WEBVTT\n\nc1\n00:00:00.000 --> 00:00:01.000\nFirst cue\n\nc2\n00:00:02.000 --> 00:00:03.000\nSecond cue\n');
  const first=await captionActions(root,'caption_track_cues',{src:'captions/test.vtt',offset:0,limit:1});
  assert.equal(first.total,2);
  assert.equal(first.returned,1);
  assert.equal(first.next_offset,1);
  assert.equal(first.cues[0].text,'First cue');
  const next=await captionActions(root,'caption_track_cues',{src:'captions/test.vtt',offset:1,limit:1});
  assert.equal(next.cues[0].text,'Second cue');
  assert.equal(next.next_offset,null);
  await assert.rejects(captionActions(root,'caption_track_cues',{src:'captions/../secrets.vtt'}));
 }finally{await rm(root,{recursive:true,force:true})}
});
