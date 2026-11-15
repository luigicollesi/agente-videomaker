// @ts-check
/**
 * Declarative per-frame animation contributions. Evaluators return data; this composer
 * applies it after all evaluators have run. Legacy modules may still mutate the scene,
 * but must not claim declarative channels without returning contributions.
 */
const categories=['native','motion','appearance','vfx'];
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const vector=(v,length=3)=>Array.isArray(v)&&v.length===length&&v.every(finite);
const allowedOps=new Set(['add','set','multiply']);
/** @param {any} result @param {string} owner */
export function validateText3DContribution(result,owner){
 if(result==null)return [];
 if(typeof result!=='object'||Array.isArray(result))throw new Error(owner+': contribution must be an object');
 const commands=[];
 for(const [type,items] of Object.entries(result)){
  if(!['transforms','materials','lights'].includes(type))throw new Error(owner+': unsupported contribution type '+type);
  if(!Array.isArray(items))throw new Error(owner+': '+type+' must be an array');
  for(const item of items){
   if(!item||typeof item!=='object'||typeof item.target!=='string'||typeof item.property!=='string')throw new Error(owner+': invalid contribution');
   const op=item.op??'set';
   if(!allowedOps.has(op))throw new Error(owner+': invalid operation '+op);
   const permitted=type==='transforms'?['position','rotation','scale']:type==='materials'?['opacity','emissiveIntensity','roughness','metalness']:['intensity'];
   if(!permitted.includes(item.property))throw new Error(owner+': unsupported '+type+' property '+item.property);
   if(type==='transforms'?!vector(item.value):!finite(item.value))throw new Error(owner+': invalid contribution value');
   commands.push({...item,type,op,owner});
  }
 }
 return commands;
}
/**
 * @param {Array<any>} commands
 * @param {{root:any,characters:any[],materials:any[],lights:any[]}} state
 */
export function applyText3DContributions(commands,state){
 // Stable ordering: insertion order from category -> module -> command.
 const targetFor=c=>{
  if(c.type==='transforms'){
   if(c.target==='root')return state.root;
   const match=/^character:(\d+)$/.exec(c.target);
   return match?state.characters[Number(match[1])]:undefined;
  }
  const match=/^(?:material|light):(\d+)$/.exec(c.target);
  if(!match)return undefined;
  return (c.type==='materials'?state.materials:state.lights)[Number(match[1])];
 };
 const exclusive=new Set();
 for(const c of commands){
  const target=targetFor(c);
  if(!target)throw new Error(c.owner+': unknown '+c.type+' target '+c.target);
  const key=c.type+':'+c.target+':'+c.property;
  if(c.op==='set'){
   if(exclusive.has(key))throw new Error('Conflicting Text3D set contributions for '+key);
   exclusive.add(key);
  }
 }
 for(const c of commands){
  const object=targetFor(c);
  const dst=object[c.property];
  if(c.type==='transforms'){
   if(c.op==='set')dst.set(...c.value);
   else if(c.op==='add'){dst.x+=c.value[0];dst.y+=c.value[1];dst.z+=c.value[2]}
   else {dst.x*=c.value[0];dst.y*=c.value[1];dst.z*=c.value[2]}
  }else{
   if(c.op==='set')object[c.property]=c.value;
   else if(c.op==='add')object[c.property]+=c.value;
   else object[c.property]*=c.value;
  }
 }
}
/** @param {Record<string,any[]>} groups @param {number} time @param {(kind:string,index:number)=>any} context */
export async function evaluateText3DAnimations(groups,time,context){
 if(!finite(time)||time<0)throw new Error('Invalid absolute frame time');
 const commands=[];
 for(const kind of categories)for(const [index,module] of (groups[kind]??[]).entries()){
  if(module.enabled===false)continue;
  const owner=kind+':'+index;
  const result=await module.evaluate(time,context(kind,index));
  commands.push(...validateText3DContribution(result,owner));
 }
 return commands;
}
