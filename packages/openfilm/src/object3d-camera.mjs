/**
 * Deterministic 3D scene camera animation. All times are absolute seconds.
 * This pure module does not allocate a renderer or mutate Text3D clip state.
 */
const finite3=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const clamp=v=>Math.max(0,Math.min(1,v));
const ease=(u,mode)=>mode==='ease-in'?u*u:mode==='ease-out'?1-(1-u)*(1-u):mode==='ease-in-out'?u*u*(3-2*u):u;
const mix=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
const isPose=p=>p&&finite3(p.position)&&finite3(p.target)&&Number.isFinite(p.fov)&&p.fov>0&&p.fov<180;
export function validateCameraKeyframes(frames){
  if(!Array.isArray(frames)||frames.length<1)throw Error('Camera requires at least one keyframe');
  let prev=-1;
  for(const frame of frames){
    if(!frame||!Number.isFinite(frame.time)||frame.time<0||frame.time<=prev||!isPose(frame))throw Error('Invalid camera keyframe');
    if(frame.easing!==undefined&&!['linear','ease-in','ease-out','ease-in-out','hold'].includes(frame.easing))throw Error('Invalid camera easing');
    prev=frame.time;
  }
  return true;
}
export function cameraPoseAt(frames,time){
  validateCameraKeyframes(frames);
  if(!Number.isFinite(time))throw Error('Invalid scene time');
  const first=frames[0],last=frames.at(-1);
  if(time<=first.time)return {position:[...first.position],target:[...first.target],fov:first.fov};
  if(time>=last.time)return {position:[...last.position],target:[...last.target],fov:last.fov};
  const nextIndex=frames.findIndex(f=>f.time>=time),a=frames[nextIndex-1],b=frames[nextIndex];
  const u=a.easing==='hold'?0:ease(clamp((time-a.time)/(b.time-a.time)),a.easing??'linear');
  return {position:mix(a.position,b.position,u),target:mix(a.target,b.target,u),fov:a.fov+(b.fov-a.fov)*u};
}
/** Orbit over a fixed target; azimuth/elevation in degrees, radius in world units. */
export function orbitCameraKeyframes({target=[0,0,0],radius=5,startAzimuth=0,endAzimuth=360,elevation=15,start=0,duration=5,fov=45}={}){
  if(!finite3(target)||![radius,startAzimuth,endAzimuth,elevation,start,duration,fov].every(Number.isFinite)||radius<=0||start<0||duration<=0||fov<=0||fov>=180)throw Error('Invalid camera orbit');
  const pose=(azimuth,time)=>{
    const a=azimuth*Math.PI/180,e=elevation*Math.PI/180,c=Math.cos(e);
    return {time,position:[target[0]+radius*Math.sin(a)*c,target[1]+radius*Math.sin(e),target[2]+radius*Math.cos(a)*c],target:[...target],fov};
  };
  // Additional samples preserve a circular trajectory rather than interpolating a chord.
  const segments=Math.max(8,Math.ceil(Math.abs(endAzimuth-startAzimuth)/15));
  return Array.from({length:segments+1},(_,i)=>pose(startAzimuth+(endAzimuth-startAzimuth)*i/segments,start+duration*i/segments));
}
