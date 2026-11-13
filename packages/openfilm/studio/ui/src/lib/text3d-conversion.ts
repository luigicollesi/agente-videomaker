/** Build an atomic OpenFilm props operation for an explicitly supported text conversion.
 * This function does not capture arbitrary HTML; callers MUST establish that the
 * destination can reproduce the source before invoking it.
 */
export type Text3DSettings = { depth:number; shadow:number; bevel:number; lighting:number };
export type SourceClip = { id:string; src:string; at?:number; time?:[number,number]; attrs?:Record<string,string>; overrides?:unknown[] };
export type Destination = { src:string; attrs:Record<string,string>; overrides?:unknown[] };
export type ClipPropEdit = {clip:string;prop:string;value:unknown};
const bounded=(n:number,min:number,max:number)=>Number.isFinite(n)?Math.min(max,Math.max(min,n)):min;
export function buildText3DConversion(source:SourceClip,destination:Destination,settings:Text3DSettings,text:string):ClipPropEdit[]{
 if(!source.id||!source.src||!destination.src||!text.trim())throw new Error('Text conversion requires a supported, nonempty source');
 if(!source.time||!Number.isFinite(source.time[0])||!Number.isFinite(source.time[1])||source.time[1]<=source.time[0])throw new Error('Invalid source time range');
 const duration=source.time[1]-source.time[0];
 const attrs={...source.attrs,...destination.attrs,'data-openfilm-content-type':'text3d','data-text3d-version':'1','data-text3d-original-src':source.src};
 const overrides=[
  ...((destination.overrides??[]) as Record<string,unknown>[]),
  {at:'.t',text},
  {at:':root',style:{
   '--text3d-depth':String(bounded(settings.depth,0,100)),
   '--text3d-shadow':String(bounded(settings.shadow,0,100)),
   '--text3d-bevel':String(bounded(settings.bevel,0,15)),
   '--text3d-light':String(bounded(settings.lighting,0,100)/100)
  }}
 ];
 return [
  {clip:source.id,prop:'src',value:destination.src},
  {clip:source.id,prop:'time',value:[0,duration]},
  {clip:source.id,prop:'attrs',value:attrs},
  {clip:source.id,prop:'overrides',value:overrides}
 ];
}
