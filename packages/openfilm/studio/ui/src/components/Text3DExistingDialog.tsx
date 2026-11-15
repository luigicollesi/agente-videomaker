import * as React from 'react';

export interface Text3DRegistryEntry {
  componentId:string;
  source2DId:string;
  version:string;
  displayName:string;
  bundlePath:string;
  sourceRevision:string;
  parameterMap:Record<string,string>;
  active:boolean;
}

export function Text3DExistingDialog({entry,onApply,onNew,onClose,busy}:{
  entry:Text3DRegistryEntry;
  onApply:()=>void;
  onNew:()=>void;
  onClose:()=>void;
  busy:boolean;
}) {
  React.useEffect(()=>{
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy)onClose()};
    window.addEventListener('keydown',key);
    return ()=>window.removeEventListener('keydown',key);
  },[onClose,busy]);
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60" onPointerDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}>
    <div role="dialog" aria-modal="true" aria-label="Existing 3D text" className="w-[min(490px,92vw)] rounded-lg bg-[var(--bg-raised)] p-5 shadow-2xl">
      <h2 className="text-base font-semibold">3D text already exists</h2>
      <p className="mt-2 text-sm text-[var(--text-muted)]">{entry.displayName} · {entry.version}</p>
      <p className="mt-2 text-sm">Apply the saved 3D component or create another version with the connected agent?</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className="rounded-md px-3 py-2 text-sm" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="button" className="rounded-md border px-3 py-2 text-sm" disabled={busy} onClick={onNew}>Create new version</button>
        <button type="button" className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm" disabled={busy} onClick={onApply}>{busy?'Applying...':'Apply existing'}</button>
      </div>
    </div>
  </div>;
}
