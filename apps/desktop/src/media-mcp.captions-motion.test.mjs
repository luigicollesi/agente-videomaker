import test from 'node:test';
import assert from 'node:assert/strict';
import { captionPage, captionCorrection, patchSubtitleStyle } from './mcp/captions.mjs';
import { motionPresetList, motionPresetOps } from './mcp/motion-presets.mjs';

test('captions are returned in compact source-linked pages',()=>{
 const info={cues:[
  {startMs:0,durMs:500,text:'First line',src:'assets/voice.mp3',line:0,clip:'voice-a'},
  {startMs:1500,durMs:900,text:'Second line',src:'assets/voice.mp3',line:1400,part:0,clip:'voice-a'},
  {startMs:3000,durMs:600,text:'Third line',src:'assets/voice.mp3',line:3000,clip:'voice-a'}
 ],sourceLanguage:'pt',languages:['pt'],untranscribed:[]};
 const first=captionPage(info,{start:0,end:4,limit:1},'0123456789abcdef');
 assert.equal(first.total,3);
 assert.equal(first.returned,1);
 assert.equal(first.next_offset,1);
 assert.equal(first.cues[0].line,0);
 const second=captionPage(info,{start:1,end:3,offset:0,limit:10},'0123456789abcdef');
 assert.equal(second.total,1);
 assert.equal(second.cues[0].part,0);
 assert.throws(()=>captionPage(info,{start:3,end:2}));
 assert.throws(()=>captionPage(info,{limit:1000}));
});
test('subtitle corrections reject unexpected or destructive arguments',()=>{
 const base={revision:'0123456789abcdef',src:'assets/voice.mp3',line:1400,part:0,text:'Updated text',expected_text:'Second line'};
 assert.equal(captionCorrection(base).line,1400);
 assert.throws(()=>captionCorrection({...base,revision:'incorrect'}));
 assert.throws(()=>captionCorrection({...base,line:-1}));
 assert.throws(()=>captionCorrection({...base,text:'x'.repeat(1201)}));
});
test('subtitle style patches preserve other fields and normalize via Studio rules',()=>{
 const before=patchSubtitleStyle(null,{font:{weight:700},fill:'#ffffff'});
 assert.equal(before.font.weight,700);
 const next=patchSubtitleStyle(before,{font:{italic:true},align:'left'});
 assert.equal(next.font.weight,700);
 assert.equal(next.font.italic,true);
 assert.equal(next.align,'left');
 assert.throws(()=>patchSubtitleStyle(before,{unknown:true}));
 assert.throws(()=>patchSubtitleStyle(before,{}));
});
test('official motion catalog is paginated and output is compact',async()=>{
 const data=await motionPresetList({slot:'in',limit:3});
 assert.equal(data.returned,3);
 assert.ok(data.presets.every(v=>v.slots.includes('in')));
 assert.ok(data.presets.every(v=>typeof v.id==='string'));
 assert.throws(()=>motionPresetList({slot:'invalid'}));
});
test('motion presets use native keyframes and enforce clip duration',async()=>{
 const film={tracks:[{clips:[{id:'image-a',src:'assets/frame.png',at:0,time:[0,3]}]}]};
 const preview=await motionPresetList({slot:'in',limit:1});
 const id=preview.presets[0].id;
 const result=await motionPresetOps(film,{clip:'image-a',slot:'in',preset_id:id,seconds:0.5});
 assert.equal(result.ops[0].op,'keyframes');
 assert.equal(result.ops[1].op,'props');
 assert.ok(result.ops[1].edits[0].value.includes('motion-in-'));
 const cleared=await motionPresetOps(film,{clip:'image-a',slot:'in',preset_id:null});
 assert.equal(cleared.ops.length,1);
 await assert.rejects(motionPresetOps(film,{clip:'image-a',slot:'in',preset_id:id,seconds:4}));
 await assert.rejects(motionPresetOps(film,{clip:'image-a',slot:'out',preset_id:'invalid'}));
});
