import test from 'node:test';
import assert from 'node:assert/strict';
import { musicAudioStream,musicAnalysisOptions,musicCueOptions,musicDecodeOptions } from './mcp/music-options.mjs';

test('Music Analyzer stream, cache and experimental options use validated CLI flags',()=>{
 assert.deepEqual(musicAudioStream({audio_stream:2}),['--audio-stream','2']);
 assert.deepEqual(musicAnalysisOptions({audio_stream:1,use_cache:true,experimental_structure_v3:true},'/local/cache'),
  ['--audio-stream','1','--experimental-structure-v3','--cache-dir','/local/cache']);
 assert.deepEqual(musicAnalysisOptions({use_cache:false,experimental_structure_v3:false}),[]);
 assert.throws(()=>musicAudioStream({audio_stream:-1}));
 assert.throws(()=>musicAudioStream({audio_stream:'0'}));
 assert.throws(()=>musicAnalysisOptions({use_cache:true},null));
 assert.throws(()=>musicAnalysisOptions({experimental_structure_v3:'yes'}));
});
test('Music editing cues accept bounded categories, merging and strength',()=>{
 assert.deepEqual(musicCueOptions({categories:['beat','energy'],selection:'chronological',min_relative_strength:0.5,merge_coincident:true,merge_window_ms:40}),
 ['--categories','beat','energy','--selection','chronological','--min-relative-strength','0.5','--merge-coincident','--merge-window-ms','40']);
 assert.deepEqual(musicCueOptions({}),[]);
 for(const opts of [
  {categories:[]},{categories:['unknown']},{categories:['beat','beat']},
  {selection:'random'},{min_relative_strength:Infinity},{min_relative_strength:-0.1},
  {merge_coincident:'yes'},{merge_window_ms:251}
 ])assert.throws(()=>musicCueOptions(opts));
});
test('Music PCM decoding rates and streams are constrained',()=>{
 assert.deepEqual(musicDecodeOptions({sample_rate:16000,audio_stream:0}),['--audio-stream','0','--sample-rate','16000']);
 assert.deepEqual(musicDecodeOptions({}),['--sample-rate','22050']);
 assert.throws(()=>musicDecodeOptions({sample_rate:0}));
 assert.throws(()=>musicDecodeOptions({sample_rate:96000}));
});
