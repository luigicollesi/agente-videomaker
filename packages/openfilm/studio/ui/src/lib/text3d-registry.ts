import * as React from 'react';
import { refreshSaved } from './saved';
import type { LibraryItem } from './library';

export interface Text3DRegistryEntry {
  source2DId:string;
  componentId:string;
  version:string;
  bundlePath:string;
  displayName:string;
  sourceRevision:string;
  parameterMap:Record<string,string>;
  status:'ready';
  active:boolean;
}

/** Shared dynamic Text3D items. The official, packaged library index stays immutable. */
export function useText3DRegistry(enabled:boolean):Text3DRegistryEntry[] {
  const [entries,setEntries]=React.useState<Text3DRegistryEntry[]>([]);
  React.useEffect(()=>{
    if(!enabled)return;
    let live=true;
    const load=async()=>{
      try{
        const response=await fetch('/api/text3d',{cache:'no-store'});
        if(!response.ok)throw new Error('Text3D registry unavailable');
        const result=await response.json() as {entries?:Text3DRegistryEntry[]};
        if(live)setEntries(Array.isArray(result.entries)?result.entries:[]);
      }catch{if(live)setEntries([])}
    };
    void load();
    const onFocus=()=>{refreshSaved();void load()};
    window.addEventListener('focus',onFocus);
    return()=>{live=false;window.removeEventListener('focus',onFocus)};
  },[enabled]);
  return entries;
}
export function text3DRegistryItems(entries:readonly Text3DRegistryEntry[]):LibraryItem[] {
  return entries.map(e=>({
    id:'generated/'+e.componentId,
    cat:'text3d',
    group:e.active?'generated':'archived',
    kind:'page',
    name:{en:e.active?e.displayName:e.displayName+' — old_'+e.version},
    src:'index.html',
    savedPath:e.bundlePath,
    source2DId:e.source2DId,
    tags:['text3d','generated','source:'+e.source2DId,e.version]
  }));
}
