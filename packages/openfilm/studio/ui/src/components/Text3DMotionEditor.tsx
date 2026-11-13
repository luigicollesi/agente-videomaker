import * as React from 'react';
import { parseMotions, encodeMotions, type Motion } from '../lib/text3d-motion';
const field='w-full rounded bg-[var(--bg-field)] px-2 py-1 text-xs text-[var(--text)]';
export function Text3DMotionEditor({value,length,onCommit}:{value:string;length:number;onCommit:(value:string)=>void}){
 const list=React.useMemo(()=>parseMotions(value),[value]),total=Math.max(.1,length);
 const save=(next:Motion[])=>onCommit(encodeMotions(next));
 const patch=(id:string,v:Partial<Motion>)=>save(list.map(m=>m.id===id?{...m,...v}:m));
 return <div className="flex flex-col gap-2 rounded border border-[var(--border)] p-2">
 <div className="flex items-center justify-between"><strong className="text-xs">3D motions ({list.length})</strong><button type="button" className={field} disabled={list.length>=64} onClick={()=>save([...list,{id:'motion-'+Date.now()+'-'+list.length,type:'rotate3d',start:Math.min(total/2,total-1),duration:1,axis:'y',turns:1}])}>+ Add</button></div>
 {list.map(m=><div key={m.id} className="flex flex-col gap-2 border-t border-[var(--border)] pt-2">
 <div className="flex gap-2"><select className={field} value={m.type} onChange={e=>patch(m.id,{type:e.target.value as Motion['type']})}><option value="rotate3d">Rotate 3D</option><option value="scale">Scale</option><option value="translate3d">Translate 3D</option></select><button type="button" className={field} onClick={()=>save(list.filter(x=>x.id!==m.id))}>Remove</button></div>
 <label className="text-xs">Start: {m.start.toFixed(2)}s<input aria-label="Motion start slider" className="w-full" type="range" min={0} max={total} step={.05} value={Math.min(total,Math.max(0,m.start))} onChange={e=>patch(m.id,{start:Number(e.target.value)})}/></label>
 <div className="grid grid-cols-2 gap-2"><label className="text-xs">Start (s)<input aria-label="Motion start" className={field} type="number" min={0} max={total} step={.05} value={m.start} onChange={e=>patch(m.id,{start:Math.min(total,Math.max(0,Number(e.target.value)||0))})}/></label>
 <label className="text-xs">Duration (s)<input aria-label="Motion duration" className={field} type="number" min={.01} step={.05} value={m.duration} onChange={e=>patch(m.id,{duration:Math.max(.01,Number(e.target.value)||.01)})}/></label></div>
 {m.type==='rotate3d'?<div className="grid grid-cols-2 gap-2"><label className="text-xs">Axis<select className={field} value={m.axis||'y'} onChange={e=>patch(m.id,{axis:e.target.value as 'x'|'y'|'z'})}><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></select></label><label className="text-xs">Turns<input className={field} type="number" step={.5} min={-20} max={20} value={m.turns??1} onChange={e=>patch(m.id,{turns:Number(e.target.value)||0})}/></label></div>:m.type==='scale'?<label className="text-xs">Scale<input className={field} type="number" step={.1} min={0} value={m.to??1} onChange={e=>patch(m.id,{to:Math.max(0,Number(e.target.value)||0)})}/></label>:<div className="grid grid-cols-3 gap-2">{(['x','y','z'] as const).map(a=><label key={a} className="text-xs">{a.toUpperCase()}<input className={field} type="number" value={m[a]??0} onChange={e=>patch(m.id,{[a]:Number(e.target.value)||0})}/></label>)}</div>}
 </div>)}
 {!list.length?<span className="text-xs text-[var(--text-muted)]">Add an event to animate 3D text.</span>:null}
 </div>;
}
