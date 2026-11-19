// Official built-in motion presets, shared with the Studio clip inspector.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { withPreset } from 'openfilm/clip-motion';
const require=createRequire(import.meta.url);
let catalogPromise;
async function catalog(){
 catalogPromise??=readFile(require.resolve('openfilm/motions-catalog'),'utf8').then(raw=>JSON.parse(raw).items.filter(item=>item.kind==='motion'));
 return catalogPromise;
}
const id=v=>typeof v==='string'&&/^[A-Za-z][\w-]{0,79}$/.test(v);
const slots=['in','out','loop'];
export async function motionPresetList(params={}){
 const slot=params.slot??null,limit=params.limit??12,offset=params.offset??0;
 if(slot!==null&&!slots.includes(slot)||!Number.isInteger(limit)||limit<1||limit>30||!Number.isInteger(offset)||offset<0)throw Error('Invalid motion preset pagination');
 const items=(await catalog()).filter(item=>!slot||item.motion?.[slot]);
 const page=items.slice(offset,offset+limit).map(item=>({
  id:item.id,name:item.name?.en??item.id,slots:Object.keys(item.motion),
  duration_seconds:Math.round((item.durationMs??0)/100)/10,
  about:String(item.about??'').slice(0,170)
 }));
 return {total:items.length,offset,returned:page.length,next_offset:offset+limit<items.length?offset+limit:null,presets:page};
}
export async function motionPresetOps(value,params){
 const {clip,slot,preset_id,seconds}=params??{};
 if(!id(clip)||!slots.includes(slot)||!(preset_id===null||typeof preset_id==='string')
   ||seconds!==undefined&&(!(typeof seconds==='number'&&Number.isFinite(seconds))||seconds<0.05||seconds>60))throw Error('Invalid motion preset parameters');
 const found=value.tracks.flatMap(t=>t.clips??[]).find(c=>c.id===clip);
 if(!found)throw Error('Clip not found');
 if(/\.(?:mp3|wav|m4a|flac|ogg)(?:#|$)/i.test(found.src))throw Error('Audio clips cannot use visual motion presets');
 const item=preset_id===null?null:(await catalog()).find(p=>p.id===preset_id);
 if(preset_id!==null&&(!item||!item.motion?.[slot]))throw Error('Motion preset does not support selected slot');
 const preset=item?{...item.motion[slot],...(seconds!==undefined?{secs:seconds}:{})}:null;
 if(preset&&(!Number.isFinite(preset.secs)||preset.secs<=0))throw Error('Invalid motion duration');
 if(preset&&(slot==='in'||slot==='out')){
  const trim=found.time;
  if(!Array.isArray(trim)||trim.length!==2||!(trim[1]>trim[0])){
   if(slot==='out')throw Error('An explicit source trim is required for motion-out');
  }else{
   const clipLength=(trim[1]-trim[0])/(found.speed??1);
   if(preset.secs>clipLength+0.001)throw Error('Motion lasts longer than clip');
  }
 }
 const style=withPreset(found.style,slot,preset)||null;
 const ops=[
  ...(preset?[{op:'keyframes',set:{[preset.name]:preset.body}}]:[]),
  {op:'props',edits:[{clip,prop:'style',value:style}]}
 ];
 return {ops,applied:preset?item.id:null,seconds:preset?.secs??null};
}
