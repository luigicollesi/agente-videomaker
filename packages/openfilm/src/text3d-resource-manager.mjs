// @ts-check
/** Owned GPU/scene resources. Ownership is explicit; shared resources stay with the core. */
export class Text3DResourceManager {
 #owners=new Map();
 #released=new WeakSet();
 /** @param {string} owner @param {any} resource */
 track(owner,resource){
  if(typeof owner!=='string'||!owner||!resource||typeof resource.dispose!=='function')
   throw new Error('Resource must have an owner and dispose()');
  if(!this.#owners.has(owner))this.#owners.set(owner,new Set());
  this.#owners.get(owner).add(resource);
  return resource;
 }
 /** @param {string} owner */
 release(owner){
  const resources=this.#owners.get(owner);
  if(!resources)return;
  this.#owners.delete(owner);
  const errors=[];
  for(const resource of resources){
   if(this.#released.has(resource))continue;
   // Do not dispose a resource that is still owned by another module.
   if([...this.#owners.values()].some(set=>set.has(resource)))continue;
   this.#released.add(resource);
   try{resource.dispose()}catch(error){errors.push(error)}
  }
  if(errors.length)throw new AggregateError(errors,'Text3D resource disposal failed');
 }
 releaseAll(){
  const errors=[];
  for(const owner of [...this.#owners.keys()])try{this.release(owner)}catch(error){errors.push(error)}
  if(errors.length)throw new AggregateError(errors,'Text3D resource cleanup failed');
 }
}
