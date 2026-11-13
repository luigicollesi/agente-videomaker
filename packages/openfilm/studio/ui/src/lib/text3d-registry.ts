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
  pageHref?:string;
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
        const result=await response.json() as {entries?:Text3DRegistryEntry[];pageBase?:string};
        const all=Array.isArray(result.entries)?result.entries:[];
        const prefix=typeof result.pageBase==='string'?result.pageBase:'';
        const mapped=all.map(entry=>({
          ...entry,
          ...(prefix?{pageHref:prefix+entry.bundlePath.replace(/^saved\//,'').split('/').map(encodeURIComponent).join('/')+'/files/index.html'}:{})
        }));
        if(live)setEntries(mapped);
      }catch{if(live)setEntries([])}
    };
    void load();
    const poll=window.setInterval(()=>void load(),12000);
    const onFocus=()=>{refreshSaved();void load()};
    window.addEventListener('focus',onFocus);
    return()=>{live=false;window.clearInterval(poll);window.removeEventListener('focus',onFocus)};
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
    pageHref:e.pageHref,
    tags:['text3d','generated','source:'+e.source2DId,e.version]
  }));
}
