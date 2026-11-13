/** Safe transport of configured 2D component properties to a saved 3D counterpart.
 * A missing mapping rejects the swap rather than silently dropping user edits.
 */
import { propsOf, propValue, withPropValue } from './component-props';
import type { FilmOverride } from './film';

export interface Text3DClip {
  id:string;
  src:string;
  time?:number[];
  attrs?:Record<string,string>;
  overrides?:FilmOverride[];
}
export interface Text3DRegistered {
  componentId:string;
  bundlePath:string;
  source2DId:string;
  displayName:string;
  version:string;
  parameterMap:Record<string,string>;
}
export function planText3DApply(source:Text3DClip,destination:Text3DClip,registry:Text3DRegistered,durationSeconds:number) {
  if(!source.id || !destination.src || !Number.isFinite(durationSeconds) || durationSeconds<=0)
    throw new Error('Invalid Text3D conversion clip');
  const sourceProps=propsOf(source),destProps=propsOf(destination);
  let overrides:FilmOverride[]|undefined=destination.overrides ? structuredClone(destination.overrides):undefined;
  for(const prop of sourceProps) {
    const value=propValue(source.overrides,prop);
    if(value===null)continue;
    const target=registry.parameterMap[prop.name];
    if(!target)throw new Error('No Text3D mapping for configured parameter: '+prop.name);
    const dest=destProps.find(p=>p.name===target&&p.type===prop.type);
    if(!dest)throw new Error('3D counterpart does not expose compatible parameter: '+target);
    overrides=withPropValue(overrides,dest,value)??undefined;
  }
  // Non-component overrides could carry transitions, fades, or custom effects.
  // They must be handled explicitly rather than silently discarded.
  const known=new Set(sourceProps.filter(p=>propValue(source.overrides,p)!==null).map(p=>p.type==='var'?':root':p.at));
  const unsupported=(source.overrides??[]).filter(o=>o.at && o.at!==':root' && !known.has(o.at));
  if(unsupported.length)throw new Error('Source has additional unmapped visual overrides');
  const root=source.overrides?.find(o=>o.at===':root');
  if(root?.style) {
    const vars=new Set(sourceProps.filter(p=>p.type==='var').map(p=>p.var));
    if(Object.keys(root.style).some(k=>k.startsWith('--')&&!vars.has(k)))
      throw new Error('Source contains unmapped CSS variables');
  }
  const fade=source.overrides?.filter(o=>!o.at && o.fade);
  if(fade?.length)overrides=[...fade,...(overrides??[])];
  const time=source.time?.length===2?source.time:[0,durationSeconds];
  const attrs={...destination.attrs,'data-openfilm-content-type':'text3d','data-text3d-source-id':registry.source2DId,'data-text3d-version':registry.version};
  return [
    {clip:source.id,prop:'src',value:destination.src},
    {clip:source.id,prop:'time',value:time},
    {clip:source.id,prop:'attrs',value:attrs},
    {clip:source.id,prop:'overrides',value:overrides??[]}
  ];
}
