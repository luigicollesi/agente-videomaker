/** Genuine WebGL2 triangular glyph extrusion from a local rasterized font mask.
 * No external assets or CDN; deliberately limits mesh complexity.
 */
export function buildGeometryHtml(text:string):string {
 if(!text.trim() || text.length>120)throw new Error('Geometry text must contain 1–120 characters');
 const payload=JSON.stringify(text).replace(/</g,'\\u003c').replace(/>/g,'\\u003e');
 return \`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
 :root{--clip-length:10.5s;--text3d-depth:18;--text3d-shadow:12;--text3d-light:1;--text3d-color:#d9eaff;--text3d-side:#4675ac;--text3d-in:0;--text3d-out:0;--text3d-events:'[]'}
 html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
 canvas{width:100%;height:100%;display:block;background:transparent;filter:drop-shadow(0 0 calc(var(--text3d-shadow) * 1px) #23476c)}
 </style></head><body><canvas id="scene" width="960" height="540"></canvas><script>
 (()=>{'use strict';
 const WORDS=\${payload},canvas=document.getElementById('scene');
 const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,preserveDrawingBuffer:true});
 if(!gl){document.body.textContent='WebGL2 is required for genuine 3D geometry';window.film={frame:()=>{},frameReadsOverrides:true};return}
 const vs=\`#version 300 es
 in vec3 a_position;in vec3 a_normal;uniform vec3 u_angles;uniform float u_scale;uniform vec3 u_offset;uniform float u_depth;
 out vec3 v_normal;out float v_side;
 void main(){vec3 p=a_position;p.z*=u_depth;
  vec3 n=a_normal;float cx=cos(u_angles.x),sx=sin(u_angles.x),cy=cos(u_angles.y),sy=sin(u_angles.y),cz=cos(u_angles.z),sz=sin(u_angles.z);
  mat3 rx=mat3(1.,0.,0.,0.,cx,sx,0.,-sx,cx);
  mat3 ry=mat3(cy,0.,-sy,0.,1.,0.,sy,0.,cy);
  mat3 rz=mat3(cz,sz,0.,-sz,cz,0.,0.,0.,1.);
  mat3 m=rz*ry*rx;p=m*p*u_scale+u_offset;n=m*n;
  float f=2.9/max(0.5,3.6-p.z);
  gl_Position=vec4(p.x*f,p.y*f*1.7777778,clamp(p.z/12.,-1.,1.),1.);
  v_normal=n;v_side=abs(a_normal.z)<.5?1.:0.;
 }\`;
 const fs=\`#version 300 es
 precision highp float;in vec3 v_normal;in float v_side;
 uniform vec3 u_front;uniform vec3 u_side;uniform float u_light;
 out vec4 color;void main(){vec3 light=normalize(vec3(-.4,.6,1.));float lambert=max(.0,dot(normalize(v_normal),light));vec3 base=mix(u_front,u_side,v_side);color=vec4(base*(.28+.72*lambert)*u_light,1.);}\`;
 function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
 const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const mask=document.createElement('canvas');mask.width=256;mask.height=80;
 const ctx=mask.getContext('2d',{willReadFrequently:true});ctx.clearRect(0,0,256,80);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 62px Impact,Arial Black,sans-serif';ctx.fillText(WORDS,128,41,240);
 const rgba=ctx.getImageData(0,0,256,80).data;
 const W=128,H=40,grid=new Uint8Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=((y*2)*256+x*2)*4;grid[y*W+x]=Math.max(rgba[i+3],rgba[i+7],rgba[i+1027],rgba[i+1031])>110?1:0;}
 const occupied=(x,y)=>x>=0&&x<W&&y>=0&&y<H&&grid[y*W+x]===1;
 const verts=[];
 function tri(a,b,c,n){for(const p of [a,b,c])verts.push(...p,...n)}
 function quad(a,b,c,d,n){tri(a,b,c,n);tri(a,c,d,n)}
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(occupied(x,y)){
  const l=(x/W-.5)*2,r=((x+1)/W-.5)*2,t=(.5-y/H)*.65,b=(.5-(y+1)/H)*.65,front=.5,back=-.5;
  quad([l,b,front],[r,b,front],[r,t,front],[l,t,front],[0,0,1]);
  quad([r,b,back],[l,b,back],[l,t,back],[r,t,back],[0,0,-1]);
  if(!occupied(x-1,y))quad([l,b,back],[l,b,front],[l,t,front],[l,t,back],[-1,0,0]);
  if(!occupied(x+1,y))quad([r,b,front],[r,b,back],[r,t,back],[r,t,front],[1,0,0]);
  if(!occupied(x,y-1))quad([l,t,front],[r,t,front],[r,t,back],[l,t,back],[0,1,0]);
  if(!occupied(x,y+1))quad([r,b,front],[l,b,front],[l,b,back],[r,b,back],[0,-1,0]);
 }
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(verts),gl.STATIC_DRAW);
 const stride=24;for(const [name,offset] of [['a_position',0],['a_normal',12]]){const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,stride,offset)}
 const U=name=>gl.getUniformLocation(program,name);
 const smooth=v=>{const n=Math.max(0,Math.min(1,v));return n*n*(3-2*n)};
 const num=(css,key,fallback)=>{const x=parseFloat(css.getPropertyValue(key));return Number.isFinite(x)?x:fallback};
 const rgb=(color)=>{const v=color.trim().match(/^#([0-9a-f]{6})$/i);if(!v)return [1,1,1];return [0,2,4].map(i=>parseInt(v[1].slice(i,i+2),16)/255)};
 const events=raw=>{try{const s=raw.trim().replace(/^'|'$/g,'');const a=JSON.parse(s);return Array.isArray(a)?a.slice(0,64):[]}catch{return []}};
 function frame(t){
  const css=getComputedStyle(document.documentElement),total=Math.max(.01,num(css,'--clip-length',10.5)),at=Math.max(0,Number(t)||0);
  const entrance=num(css,'--text3d-in',0),exit=num(css,'--text3d-out',0);
  let scale=entrance>0?smooth(at/entrance):1;if(exit>0&&at>total-exit)scale*=1-smooth((at-(total-exit))/exit);
  const angles={x:0,y:0,z:0},offset={x:0,y:0,z:0};
  for(const event of events(css.getPropertyValue('--text3d-events'))){
   if(!event||!Number.isFinite(event.start)||!Number.isFinite(event.duration)||event.duration<=0)continue;
   const p=smooth((at-event.start)/event.duration);
   if(event.type==='rotate3d'&&['x','y','z'].includes(event.axis))angles[event.axis]+=(Number(event.turns)||0)*2*Math.PI*p;
   else if(event.type==='scale')scale*=1+((Number(event.to)||1)-1)*p;
   else if(event.type==='translate3d'){for(const axis of ['x','y','z'])offset[axis]+=(Number(event[axis])||0)*p/300}
  }
  gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform3f(U('u_angles'),angles.x,angles.y,angles.z);
  gl.uniform3f(U('u_offset'),offset.x,offset.y,offset.z);
  gl.uniform1f(U('u_scale'),at>=total?0:Math.max(0,scale));
  gl.uniform1f(U('u_depth'),Math.max(0,num(css,'--text3d-depth',18))/100);
  gl.uniform1f(U('u_light'),Math.max(0,num(css,'--text3d-light',1)));
  const front=rgb(css.getPropertyValue('--text3d-color')||'#d9eaff'),side=rgb(css.getPropertyValue('--text3d-side')||'#4675ac');
  gl.uniform3fv(U('u_front'),front);gl.uniform3fv(U('u_side'),side);
  gl.drawArrays(gl.TRIANGLES,0,verts.length/6);gl.flush();
 }
 window.film={frame,frameReadsOverrides:true};frame(0);
 if(!window.filmHost){const start=performance.now();const tick=now=>{frame(((now-start)/1000)%10.5);requestAnimationFrame(tick)};requestAnimationFrame(tick)}
 })();
 </script></body></html>\`;
}
