/** Isolated HTML-to-3D surface renderer. Never rewrites the original source. */
export function safeProjectPage(src:string):boolean {
 return !!src && !src.includes('\\') && !src.includes('?') && !src.includes('#') &&
   !src.startsWith('/') && !src.split('/').some(part => !part || part==='.' || part==='..') &&
   /\.html?$/i.test(src) && !/[\u0000-\u001f"'<>]/.test(src);
}
export function buildProjectionHtml(src:string, sourceStart:number):string {
 if(!safeProjectPage(src))throw new Error('Expected a local project HTML page');
 if(!Number.isFinite(sourceStart)||sourceStart<0)throw new Error('Invalid source start');
 const relative='../'+src;
 // JSON quoting is necessary for the JS string, and HTML escaping for attributes.
 const quoted=JSON.stringify(relative).replace(/</g,'\\u003c');
 return \`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
 :root{--clip-length:10.5s;--text3d-depth:18;--text3d-shadow:15;--text3d-light:1;--text3d-in:0;--text3d-out:0;--text3d-events:'[]'}
 html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
 body{perspective:1200px;perspective-origin:center;display:grid;place-items:center}
 #space{position:absolute;inset:0;transform-style:preserve-3d;will-change:transform;filter:brightness(var(--text3d-light)) drop-shadow(0px 0px calc(var(--text3d-shadow) * 1px) rgba(0,0,0,.45))}
 iframe{position:absolute;inset:0;border:0;width:100%;height:100%;background:transparent;pointer-events:none;transform-style:preserve-3d}
 </style></head><body><div id="space"><iframe id="original" allowtransparency="true" loading="eager"></iframe></div><script>
 (()=>{'use strict';
 const frame=document.getElementById('original'),space=document.getElementById('space');
 const source=\${quoted},offset=\${sourceStart};
 const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
 const smooth=v=>{const u=clamp(v);return u*u*(3-2*u)};
 const number=(css,k,f)=>{const n=parseFloat(css.getPropertyValue(k));return Number.isFinite(n)?n:f};
 let ready=false,at=0;
 frame.addEventListener('load',()=>{ready=true;void render(at)});
 frame.src=source;
 const events=raw=>{try{let s=raw.trim();if(s.startsWith("'")&&s.endsWith("'"))s=s.slice(1,-1);const v=JSON.parse(s);return Array.isArray(v)?v.slice(0,64):[]}catch{return []}};
 async function render(t){
  at=Math.max(0,Number(t)||0);const css=getComputedStyle(document.documentElement),end=Math.max(.01,number(css,'--clip-length',10.5));
  const entrance=Math.max(0,number(css,'--text3d-in',0)),exit=Math.max(0,number(css,'--text3d-out',0));
  let scale=entrance?smooth(at/entrance):1;
  if(exit&&at>end-exit)scale*=1-smooth((at-(end-exit))/exit);
  const rot={x:0,y:0,z:0};let x=0,y=0,z=0;
  for(const e of events(css.getPropertyValue('--text3d-events'))){
   if(!e||!Number.isFinite(e.start)||!Number.isFinite(e.duration)||e.duration<=0)continue;
   const p=smooth((at-e.start)/e.duration);
   if(e.type==='rotate3d'&&['x','y','z'].includes(e.axis))rot[e.axis]+=(Number(e.turns)||0)*360*p;
   else if(e.type==='scale')scale*=1+((Number(e.to)||1)-1)*p;
   else if(e.type==='translate3d'){x+=(Number(e.x)||0)*p;y+=(Number(e.y)||0)*p;z+=(Number(e.z)||0)*p}
  }
  space.style.transform='translate3d('+x+'px,'+y+'px,'+z+'px) rotateX('+rot.x+'deg) rotateY('+rot.y+'deg) rotateZ('+rot.z+'deg) scale('+Math.max(0,scale)+')';
  space.style.visibility=at>=end?'hidden':'visible';
  if(!ready)return;
  try{
   const child=frame.contentWindow;
   if(child&&child.film&&typeof child.film.frame==='function')await child.film.frame(at+offset);
  }catch(error){throw new Error('The original HTML cannot be synchronized: '+String(error))}
 }
 window.film={frame:render,frameReadsOverrides:true};
 })();
 </script></body></html>\`;
}
