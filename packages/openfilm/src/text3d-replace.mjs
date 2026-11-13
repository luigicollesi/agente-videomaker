// @ts-check
/** Conservative Text3D replacement: refuse any source override that cannot be faithfully mapped. */
/** @typedef {{name:string,type:string,at?:string,n?:number,var?:string}} Prop */
/** @typedef {{at?:string,n?:number,text?:string,style?:Record<string,string>,fade?:number[]}} Override */
/** @param {Record<string,any>} clip */
/** @returns {Prop[]} */
const props=clip=>{try{const parsed=JSON.parse(clip.attrs?.['data-props']||'[]');return Array.isArray(parsed)?parsed:[]}catch{return []}};
/** @param {Record<string,any>} source @param {Record<string,any>} destination @param {Record<string,string>} mapping */
export function replacementEdits(source,destination,mapping){
 if(!source.id||!destination.src)throw Error('Missing clip identity or target page');
 const original=props(source),target=props(destination);
 if(!Array.isArray(original)||!Array.isArray(target))throw Error('Invalid component properties');
 /** @type {Override[]} */
 const applied=/** @type {Override[]} */ (Array.isArray(destination.overrides)?structuredClone(destination.overrides):[]);
 /** @type {Set<number>} */
 const used=new Set();
 const usedVars=new Set();
 for(const prop of /** @type {Prop[]} */ (original)){
  const input=/** @type {Override[]} */ (source.overrides??[]);
  const records=input.map((o,i)=>({o,i})).filter(({o})=>prop.type==='var'?o.at===':root'&&o.style&&Object.hasOwn(o.style,prop.var??''):o.at===prop.at&&(prop.n==null||o.n===prop.n)&& (prop.type==='text'?typeof o.text==='string':false));
  if(!records.length)continue;
  if(prop.type!=='var'&&prop.type!=='text')throw Error('Unsupported configured Text3D property: '+prop.name);
  const mapped=mapping[prop.name];
  const dest=target.find(p=>p.name===mapped&&p.type===prop.type);
  if(!mapped||!dest)throw Error('Missing Text3D mapping for '+prop.name);
  for(const {o,i} of records){
    used.add(i);
    if(prop.type==='var'){
      usedVars.add(prop.var);
      if(prop.var==='--clip-length')continue;
      const name=dest.var;
      const entry=applied.find(a=>a.at===':root')??{at:':root',style:{}};
      if(!applied.includes(entry))applied.push(entry);
      entry.style??={};
      entry.style[name]=o.style[prop.var];
    }else{
      const old=applied.find(a=>a.at===dest.at&&(dest.n==null||a.n===dest.n));
      if(old)old.text=o.text;
      else applied.push({at:dest.at,...(dest.n?{n:dest.n}:{}),text:o.text});
    }
  }
 }
 for(const [i,o] of /** @type {Override[]} */ (source.overrides??[]).entries()){
  if(used.has(i)){
   if(o.at===':root'&&o.style&&Object.keys(o.style).some(k=>k!=='--clip-length'&&!usedVars.has(k)))throw Error('Unmapped root CSS property');
   continue;
  }
  if(!o.at && Array.isArray(o.fade)){applied.unshift(structuredClone(o));continue}
  if(o.at===':root'&&o.style&&Object.keys(o.style).every(k=>k==='--clip-length'||usedVars.has(k)))continue;
  throw Error('Unmapped clip override prevents safe Text3D application');
 }
 const raw=source.time;
 const start=Array.isArray(raw)&&Number.isFinite(raw[0])?raw[0]:0;
 const end=Array.isArray(raw)&&Number.isFinite(raw[1])?raw[1]:null;
 if(end===null||end<=start)throw Error('Clip duration must be explicit for safe Text3D replacement');
 const attrs={...source.attrs,...destination.attrs,
   'data-openfilm-content-type':'text3d'};
 return [
  {clip:source.id,prop:'src',value:destination.src},
  {clip:source.id,prop:'time',value:[0,end-start]},
  {clip:source.id,prop:'attrs',value:attrs},
  {clip:source.id,prop:'overrides',value:applied}
 ];
}
