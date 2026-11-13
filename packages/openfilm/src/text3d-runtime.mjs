// @ts-check
/** OpenFilm Text3D v1: deterministic group and character motion over real 3D object transforms.
 * The component provides Three.js (or compatible) objects and owns its visual effect renderer.
 * External motion NEVER changes the component's internal simulation clock.
 */
/** @typedef {{x:number,y:number,z:number}} Vector3 */
/** @typedef {{position:Vector3,rotation:Vector3,scale:Vector3}} MotionObject */
/** @typedef {'linear'|'ease-in'|'ease-out'|'ease-in-out'} Easing */
/** @typedef {{id:string,target:'group'|'characters',type:'translate'|'rotate'|'scale',start:number,duration:number,from:number[],to:number[],easing?:Easing,stagger?:number,reverse?:boolean}} MotionEvent */
/** @param {number} degrees */
const radians=degrees=>degrees*Math.PI/180;
/** @param {number} n */
const smooth=n=>n*n*(3-2*n);
/** @param {number} t @param {number} start @param {number} duration @param {Easing} [easing] */
export function motionProgress(t,start,duration,easing='linear') {
 const x=duration>0?Math.min(1,Math.max(0,(t-start)/duration)):Number(t>=start);
 if(easing==='ease-in')return x*x;
 if(easing==='ease-out')return 1-(1-x)*(1-x);
 if(easing==='ease-in-out')return smooth(x);
 return x;
}
/** @param {number} time @param {number} length @param {number} entrance @param {number} exit */
export function text3DEnvelope(time,length,entrance,exit){
 const total=Math.max(0,length),e=Math.max(0,entrance),o=Math.max(0,exit);
 if(time<0||time>=total)return 0;
 const inRatio=e>0?motionProgress(time,0,e,'ease-in-out'):1;
 const outRatio=o>0?1-motionProgress(time,total-o,o,'ease-in-out'):1;
 return Math.max(0,Math.min(inRatio,outRatio));
}
/** @param {string} value */
export function text3DGraphemes(value) {
 if(typeof Intl.Segmenter==='function')return [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value)].map(s=>s.segment);
 return Array.from(value);
}
/** @param {MotionObject} object */
const snapshot=object=>({
 position:[object.position.x,object.position.y,object.position.z],
 rotation:[object.rotation.x,object.rotation.y,object.rotation.z],
 scale:[object.scale.x,object.scale.y,object.scale.z],
});
/** @param {MotionObject} object @param {ReturnType<typeof snapshot>} base */
function restore(object,base){
 [object.position.x,object.position.y,object.position.z]=base.position;
 [object.rotation.x,object.rotation.y,object.rotation.z]=base.rotation;
 [object.scale.x,object.scale.y,object.scale.z]=base.scale;
}
/** @param {MotionEvent} event */
export function validMotionEvent(event){
 return event&&typeof event.id==='string'&&event.id.length>0&&
 ['group','characters'].includes(event.target)&&
 ['translate','rotate','scale'].includes(event.type)&&
 Number.isFinite(event.start)&&Number.isFinite(event.duration)&&event.duration>=0&&
 Array.isArray(event.from)&&Array.isArray(event.to)&&event.from.length===3&&event.to.length===3&&
 [...event.from,...event.to].every(Number.isFinite)&&
 (event.stagger===undefined||(Number.isFinite(event.stagger)&&event.stagger>=0));
}
/** @param {MotionObject} object @param {MotionEvent} event @param {number} time */
function apply(object,event,time){
 const p=motionProgress(time,event.start,event.duration,event.easing);
 const values=event.from.map((n,i)=>n+(event.to[i]-n)*p);
 const target=event.type==='translate'?object.position:event.type==='rotate'?object.rotation:object.scale;
 for(const [axis,i] of /** @type {const} */ ([['x',0],['y',1],['z',2]])){
  const value=event.type==='rotate'?radians(values[i]):values[i];
  if(event.type==='scale')target[axis]*=value;
  else target[axis]+=value;
 }
}
/**
 * @param {{group:MotionObject,characters:MotionObject[],internalFrame?:(time:number)=>void|Promise<void>,events?:MotionEvent[]}} config
 */
export function createText3DMotion(config){
 const {group,characters,internalFrame}=config;
 if(!group||!Array.isArray(characters))throw new Error('Text3D requires group and characters[]');
 const baseline={group:snapshot(group),characters:characters.map(snapshot)};
 let events=/** @type {MotionEvent[]} */ ([]);
 const setMotion=(/** @type {MotionEvent[]} */ incoming)=>{
  if(!Array.isArray(incoming)||incoming.length>256||!incoming.every(validMotionEvent))
   throw new Error('Invalid Text3D motion events');
  const ids=new Set(incoming.map(e=>e.id));
  if(ids.size!==incoming.length)throw new Error('Motion event IDs must be unique');
  events=incoming.map(e=>({...e,from:[...e.from],to:[...e.to]}));
 };
 setMotion(config.events??[]);
 const frame=async(/** @type {number} */ time)=>{
  if(!Number.isFinite(time)||time<0)throw new Error('Invalid absolute frame time');
  restore(group,baseline.group);
  characters.forEach((character,i)=>restore(character,baseline.characters[i]));
  if(internalFrame)await internalFrame(time);
  for(const event of events){
   if(event.target==='group'){apply(group,event,time);continue}
   characters.forEach((character,i)=>{
    const sequence=event.reverse?characters.length-1-i:i;
    apply(character,{...event,start:event.start+sequence*(event.stagger??0)},time);
   });
  }
 };
 return {frame,setMotion,getMotion:()=>events.map(e=>({...e,from:[...e.from],to:[...e.to]}))};
}
