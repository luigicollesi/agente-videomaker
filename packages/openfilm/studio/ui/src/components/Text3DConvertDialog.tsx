import * as React from 'react';
export type Text3DConvertSettings = { mode:'projection'|'geometry'; depth:number; shadow:number; bevel:number; lighting:number };
export function Text3DConvertDialog({title,geometryEligible,reason,onClose,onApply}:{title:string;geometryEligible:boolean;reason:string;onClose:()=>void;onApply?:(settings:Text3DConvertSettings)=>void}){
 const [mode,setMode]=React.useState<'projection'|'geometry'>('projection');
 const [depth,setDepth]=React.useState(18);
 const [shadow,setShadow]=React.useState(35);
 const [bevel,setBevel]=React.useState(3);
 const [lighting,setLighting]=React.useState(65);
 React.useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[onClose]);
 const number=(label:string,value:number,max:number,change:(v:number)=>void)=> <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]" key={label}><span className="flex justify-between"><span>{label}</span><span>{value}</span></span><input type="range" min={0} max={max} step={1} value={value} onChange={e=>change(Number(e.target.value))}/></label>;
 return <div data-text3d-dialog="" className="fixed inset-0 z-[90] grid place-items-center bg-black/60" onPointerDown={e=>{if(e.target===e.currentTarget)onClose()}}>
   <div role="dialog" aria-modal="true" aria-label="Convert to 3D Text" className="flex max-h-[90vh] w-[min(520px,92vw)] flex-col gap-4 overflow-y-auto rounded-lg bg-[var(--bg-raised)] p-5 shadow-2xl ring-1 ring-[var(--border)]">
     <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Convert to 3D Text</h2><button type="button" aria-label="Close" onClick={onClose}>✕</button></div>
     <p className="text-xs text-[var(--text-muted)]">Source: {title}</p>
     <fieldset className="flex flex-col gap-3"><legend className="mb-2 text-xs font-semibold">Conversion mode</legend>
       <label className="flex gap-2 text-xs"><input type="radio" checked={mode==='projection'} onChange={()=>setMode('projection')}/> <span><strong>Project original HTML in 3D</strong><span className="block text-[var(--text-muted)]">Keep the original procedural appearance and project it on a 3D surface.</span></span></label>
       <label className="flex gap-2 text-xs"><input type="radio" disabled={!geometryEligible} checked={mode==='geometry'} onChange={()=>setMode('geometry')}/><span><strong>Rebuild actual 3D letters</strong><span className="block text-[var(--text-muted)]">{geometryEligible?'Rebuild compatible vector glyphs as geometry.':reason}</span></span></label>
     </fieldset>
     <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-3">
       <strong className="text-xs">Initial 3D appearance</strong>
       {number('Depth (px)',depth,100,setDepth)}
       {number('Shadow (%)',shadow,100,setShadow)}
       {number('Bevel (px)',bevel,15,setBevel)}
       {number('Lighting (%)',lighting,100,setLighting)}
     </div>
     {!onApply?<p role="status" className="rounded bg-[var(--bg-field)] p-2 text-xs text-[var(--text-muted)]">The conversion adapter is not yet available. Your original clip will remain unchanged.</p>:null}
     <div className="flex justify-end gap-2"><button type="button" className="rounded bg-[var(--bg-field)] px-3 py-2 text-xs" onClick={onClose}>Cancel</button><button type="button" className="rounded bg-[var(--accent)] px-3 py-2 text-xs text-white disabled:opacity-40" disabled={!onApply||(mode==='geometry'&&!geometryEligible)} onClick={()=>onApply?.({mode,depth,shadow,bevel,lighting})}>Apply</button></div>
   </div>
 </div>;
}
