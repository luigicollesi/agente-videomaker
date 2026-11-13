// @ts-check
/** Conservative Text3D replacement: refuse any source override that cannot be faithfully mapped. */
/** @typedef {{name:string,type:'var',var:string}|{name:string,type:'text',at:string,n?:number}} Prop */
/** @typedef {{at?:string,n?:number,text?:string,style?:Record<string,string>,fade?:number[]}} Override */
/** @param {Record<string,any>} clip */
/** @returns {Prop[]} */
const props=(/** @type {Record<string,any>} */ clip)=>{try{const parsed=JSON.parse(clip.attrs?.['data-props']||'[]');if(!Array.isArray(parsed))throw Error('Invalid component property list');return /** @type {Prop[]} */ (parsed.map(p=>{if(!p||typeof p.name!=='string'||!p.name)throw Error('Invalid component property');if(p.type==='var'&&typeof p.var==='string'&&p.var.startsWith('--'))return {name:p.name,type:'var',var:p.var};if(p.type==='text'&&typeof p.at==='string'&&p.at)return {name:p.name,type:'text',at:p.at,...(Number.isInteger(p.n)&&p.n>0?{n:p.n}:{})};throw Error('Invalid component property: '+p.name)}))}catch(e){throw Error('Invalid data-props: '+(e instanceof Error?e.message:String(e)))}};
/** @param {Record<string,any>} source @param {Record<string,any>} destination @param {Record<string,string>} mapping @param {number} [effectiveLength] */
export function replacementEdits(source,destination,mapping,effectiveLength){
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
  if(prop.type==='var'&&prop.var==='--clip-length'){
   for(const {i} of records)used.add(i);
   usedVars.add('--clip-length');
   continue;
  }
  if(prop.type!=='var'&&prop.type!=='text')throw Error('Unsupported configured Text3D property: '+prop.name);
  const mapped=mapping[prop.name];
  const dest=target.find(p=>p.name===mapped&&p.type===prop.type);
  if(!mapped||!dest)throw Error('Missing Text3D mapping for '+prop.name);
  for(const {o,i} of records){
    used.add(i);
    if(prop.type==='var'){
      usedVars.add(prop.var);
      const name=dest.var;
      const entry=applied.find(a=>a.at===':root')??{at:':root',style:{}};
      if(!applied.includes(entry))applied.push(entry);
      entry.style??={};
      if(!o.style)throw Error('Missing CSS variable override');
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
 const length=effectiveLength===undefined?end-start:effectiveLength;
 if(!Number.isFinite(length)||length<=0)throw Error('Invalid effective Text3D duration');
 const attrs={...source.attrs,...destination.attrs,
   'data-openfilm-content-type':'text3d',
   ...(destination.attrs?.['data-text3d-source-id']?{'data-text3d-source-id':destination.attrs['data-text3d-source-id']}:{}),
   ...(destination.attrs?.['data-text3d-version']?{'data-text3d-version':destination.attrs['data-text3d-version']}:{})};
 return [
  {clip:source.id,prop:'src',value:destination.src},
  {clip:source.id,prop:'time',value:[0,length]},
  {clip:source.id,prop:'attrs',value:attrs},
  {clip:source.id,prop:'overrides',value:applied}
 ];
}
