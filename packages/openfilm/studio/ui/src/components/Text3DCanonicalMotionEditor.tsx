import * as React from 'react';

type Axis = [number,number,number];
type Motion = {
  id:string; target:'group'|'characters'; type:'translate'|'rotate'|'scale';
  start:number; duration:number; from:Axis; to:Axis;
  easing?:'linear'|'ease-in'|'ease-out'|'ease-in-out'; stagger?:number; reverse?:boolean;
};
const isMotion=(x:unknown):x is Motion=>{
  if(!x || typeof x!=='object')return false;
  const e=x as Record<string,unknown>;
  return typeof e.id==='string'&&e.id.length>0&&
    (e.target==='group'||e.target==='characters')&&
    (e.type==='translate'||e.type==='rotate'||e.type==='scale')&&
    typeof e.start==='number'&&Number.isFinite(e.start)&&e.start>=0&&
    typeof e.duration==='number'&&Number.isFinite(e.duration)&&e.duration>=0&&
    Array.isArray(e.from)&&e.from.length===3&&e.from.every(v=>typeof v==='number'&&Number.isFinite(v))&&
    Array.isArray(e.to)&&e.to.length===3&&e.to.every(v=>typeof v==='number'&&Number.isFinite(v));
};
export function decodeCanonicalMotions(raw:string):Motion[]|null{
  try {
    const s=raw.trim();
    let source=s;
    if(s.startsWith("'")&&s.endsWith("'"))source=s.slice(1,-1);
    else if(s.startsWith('"')&&s.endsWith('"'))source=JSON.parse(s) as string;
    const list:unknown=JSON.parse(source);
    if(!Array.isArray(list)||list.length>64||!list.every(isMotion))return null;
    if(new Set(list.map(m=>m.id)).size!==list.length)return null;
    return list;
  } catch {return null}
}
const encoded=(list:Motion[])=>"'"+JSON.stringify(list).replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"'";
const field='w-full min-w-0 rounded bg-[var(--bg-field)] px-2 py-1 text-xs text-[var(--text)]';
const newMotion=():Motion=>({id:'motion-'+crypto.randomUUID(),target:'group',type:'rotate',start:0,duration:1,from:[0,0,0],to:[0,360,0],easing:'ease-in-out'});
export function Text3DCanonicalMotionEditor({value,length,onCommit}:{value:string;length:number;onCommit:(v:string)=>void}){
  const motions=React.useMemo(()=>decodeCanonicalMotions(value),[value]);
  if(motions===null)return <span className="text-xs">Invalid canonical motion data. Edit JSON to repair.</span>;
  const save=(next:Motion[])=>onCommit(encoded(next));
  const patch=(id:string,p:Partial<Motion>)=>save(motions.map(m=>m.id===id?{...m,...p}:m));
  return <div className="flex flex-col gap-2 rounded border border-[var(--border)] p-2">
    <div className="flex items-center justify-between">
      <strong className="text-xs">3D motion events ({motions.length})</strong>
      <button type="button" className={field} disabled={motions.length>=64} onClick={()=>save([...motions,newMotion()])}>+ Add</button>
    </div>
    {motions.map(m=><div key={m.id} className="flex flex-col gap-2 border-t border-[var(--border)] pt-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">Target<select className={field} value={m.target} onChange={e=>patch(m.id,{target:e.target.value as Motion['target']})}><option value="group">Whole text</option><option value="characters">Characters</option></select></label>
        <label className="text-xs">Transform<select className={field} value={m.type} onChange={e=>patch(m.id,{type:e.target.value as Motion['type'],from:e.target.value==='scale'?[1,1,1]:[0,0,0],to:e.target.value==='scale'?[1,1,1]:[0,0,0]})}><option value="rotate">Rotate (degrees)</option><option value="translate">Translate</option><option value="scale">Scale</option></select></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">Start (s)<input className={field} type="number" min={0} max={Math.max(0,length)} step=".05" value={m.start} onChange={e=>patch(m.id,{start:Math.max(0,Number(e.target.value)||0)})}/></label>
        <label className="text-xs">Duration (s)<input className={field} type="number" min={0} step=".05" value={m.duration} onChange={e=>patch(m.id,{duration:Math.max(0,Number(e.target.value)||0)})}/></label>
      </div>
      {(['from','to'] as const).map(side=><div key={side} className="grid grid-cols-3 gap-2">{([0,1,2] as const).map(i=><label key={i} className="text-xs">{side} {['X','Y','Z'][i]}<input className={field} type="number" step=".1" value={m[side][i]} onChange={e=>{const v=[...m[side]] as Axis;v[i]=Number(e.target.value)||0;patch(m.id,{[side]:v})}}/></label>)}</div>)}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">Easing<select className={field} value={m.easing??'linear'} onChange={e=>patch(m.id,{easing:e.target.value as Motion['easing']})}>{['linear','ease-in','ease-out','ease-in-out'].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
        <label className="text-xs">Character stagger (s)<input className={field} type="number" min={0} step=".05" disabled={m.target!=='characters'} value={m.stagger??0} onChange={e=>patch(m.id,{stagger:Math.max(0,Number(e.target.value)||0)})}/></label>
      </div>
      <div className="flex justify-between"><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={m.reverse??false} disabled={m.target!=='characters'} onChange={e=>patch(m.id,{reverse:e.target.checked})}/> Reverse order</label><button type="button" className={field} onClick={()=>save(motions.filter(x=>x.id!==m.id))}>Remove</button></div>
    </div>)}
  </div>;
}
