/** Small validated MCP -> Music Analyzer CLI options. Source analysis remains in Python. */
export const CUE_CATEGORIES=Object.freeze(['beat','onset','strong_onset','energy','harmonic_change','structure_boundary']);
export function musicAudioStream(args){
 const n=args?.audio_stream;
 if(n===undefined)return [];
 if(!Number.isInteger(n)||n<0||n>64)throw Error('Invalid audio stream (0..64)');
 return ['--audio-stream',String(n)];
}
export function musicAnalysisOptions(args,cachePath){
 const flags=musicAudioStream(args);
 if(args?.experimental_structure_v3!==undefined){
  if(typeof args.experimental_structure_v3!=='boolean')throw Error('Invalid experimental_structure_v3');
  if(args.experimental_structure_v3)flags.push('--experimental-structure-v3');
 }
 if(args?.use_cache!==undefined){
  if(typeof args.use_cache!=='boolean')throw Error('Invalid use_cache');
  if(args.use_cache){
   if(typeof cachePath!=='string'||!cachePath)throw Error('Music cache unavailable');
   flags.push('--cache-dir',cachePath);
  }
 }
 return flags;
}
export function musicCueOptions(args){
 const flags=[];
 if(args?.categories!==undefined){
  const v=args.categories;
  if(!Array.isArray(v)||v.length<1||v.length>6||!v.every(x=>typeof x==='string'&&CUE_CATEGORIES.includes(x))||new Set(v).size!==v.length)
   throw Error('Invalid acoustic cue categories');
  flags.push('--categories',...v);
 }
 if(args?.selection!==undefined){
  if(!['representative','chronological'].includes(args.selection))throw Error('Invalid cue selection');
  flags.push('--selection',args.selection);
 }
 if(args?.min_relative_strength!==undefined){
  const v=args.min_relative_strength;
  if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)throw Error('Invalid relative cue strength');
  flags.push('--min-relative-strength',String(v));
 }
 if(args?.merge_coincident!==undefined){
  if(typeof args.merge_coincident!=='boolean')throw Error('Invalid cue merging flag');
  if(args.merge_coincident)flags.push('--merge-coincident');
 }
 if(args?.merge_window_ms!==undefined){
  const v=args.merge_window_ms;
  if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>250)throw Error('Invalid coincidence merge window');
  flags.push('--merge-window-ms',String(v));
 }
 return flags;
}
export function musicDecodeOptions(args){
 const flags=musicAudioStream(args);
 const sampleRate=args?.sample_rate??22050;
 if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>48000)throw Error('Invalid PCM sample rate');
 flags.push('--sample-rate',String(sampleRate));
 return flags;
}
