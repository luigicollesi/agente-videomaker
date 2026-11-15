/** Stable 2D component identity: built-in and Saved bundles across projects,
 * project-scoped cryptographic identifier for standalone local pages.
 */
export async function text3DSourceId(src:string,projectId:string,knownId?:string|null):Promise<string>{
  if(knownId)return knownId;
  const original=src.split('#')[0]??'';
  const builtin=/^saved\/openfilm\/text-([^/]+)\//.exec(original);
  if(builtin)return 'text/'+builtin[1];
  const saved=/^saved\/(.+)\/files\/[^/]+\.html?$/i.exec(original);
  if(saved&&/^[a-z0-9/_-]+$/i.test(saved[1]))return 'saved/'+saved[1];
  if(!original || !/^[-a-z0-9_/ .]+\.html?$/i.test(original))throw new Error('Unsupported text component source');
  const bytes=new TextEncoder().encode(original);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const suffix=[...new Uint8Array(digest)].slice(0,16).map(n=>n.toString(16).padStart(2,'0')).join('');
  const safeProject=projectId.replace(/[^a-z0-9_-]/gi,'-');
  return 'project/'+safeProject+'/'+suffix;
}
