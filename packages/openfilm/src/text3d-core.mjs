// @ts-check
/** Shared Text3D v2 core. Rendering, model ownership and time are controlled here. */
import {createText3DMotion,text3DGraphemes} from './text3d-runtime.mjs';
import {Text3DResourceManager} from './text3d-resource-manager.mjs';
import {evaluateText3DAnimations,applyText3DContributions} from './text3d-animation-composer.mjs';

/**
 * Animation modules are evaluated in absolute seconds, never accumulated deltas.
 * @param {{THREE:any,canvas:HTMLCanvasElement,font:any,text:string,depth?:number,size?:number,
 * native?:any[],motion?:any[],appearance?:any[],vfx?:any[]}} options
 */
export function createText3DCore(options){
 const {THREE,canvas}=options;
 let activeFont=options.font;
 let fontSize=Number.isFinite(options.size)&&options.size>0?options.size:.43;
 let letterSpacing=0;
 let textAlign='center';
 const makeGeometry=THREE.TextGeometry;
 if(!makeGeometry)throw new Error('THREE.TextGeometry addon required in core options');
 const animations={native:options.native??[],motion:options.motion??[],appearance:options.appearance??[],vfx:options.vfx??[]};
 for(const key of ['native','motion','appearance','vfx']){
  if(!Array.isArray(animations[key])||animations[key].some(a=>typeof a?.evaluate!=='function'))
   throw new Error('Invalid Text3D '+key+' animation modules');
 }
 // Effects may declare exclusive channel claims; reject ambiguous ownership.
 const channels=new Map();
 for(const kind of ['native','motion','appearance','vfx'])for(const [index,effect] of animations[kind].entries()){
  const owner=kind+':'+index;
  for(const channel of effect.channels??[]){
   if(typeof channel!=='string'||!channel)throw new Error('Invalid effect channel');
   if(channels.has(channel))throw new Error('Conflicting Text3D channel '+channel+' ('+channels.get(channel)+' / '+owner+')');
   channels.set(channel,owner);
  }
 }
 const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});
 renderer.setSize(canvas.width,canvas.height,false);
 renderer.setClearColor(0,0);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,canvas.width/canvas.height,.1,100);
 camera.position.set(0,0,5.2);
 // Use restrained studio lighting to preserve saturated typography colors.
 const ambient=new THREE.AmbientLight(0xffffff,.55);
 const key=new THREE.DirectionalLight(0xffffff,1.2);
 key.position.set(-2,4,6);scene.add(ambient,key);
 const outer=new THREE.Group(),orientation=new THREE.Group(),root=new THREE.Group();outer.add(orientation);orientation.add(root);scene.add(outer);
 root.rotation.y=-.22;
 const front=new THREE.MeshStandardMaterial({color:0xdae9ff,metalness:.28,roughness:.35,transparent:true});
 const side=new THREE.MeshStandardMaterial({color:0x577eae,metalness:.4,roughness:.5,transparent:true});
 const characters=[],meshes=[];
 let modelText='',depth=Number.isFinite(options.depth)&&options.depth>0?options.depth:.15;
 let viewportWidth=canvas.width,viewportHeight=canvas.height;
 /** @type {{x:number,y:number,width:number,height:number}|null} */
 let targetViewport=null;
 const fit=()=>{
  // Measure unscaled geometry; otherwise each edit compounds the previous fit.
  outer.position.set(0,0,0);outer.scale.setScalar(1);
  outer.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(orientation);
  if(box.isEmpty())return;
  const width=Math.max(.01,box.max.x-box.min.x),height=Math.max(.01,box.max.y-box.min.y);
  // Perspective sizing must use the nearest glyph surface, not just camera-to-origin.
 const nearestZ=Math.max(box.max.z,0);
 const distance=Math.max(camera.near+.01,camera.position.z-nearestZ);
 const visibleHeight=2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
  const visibleWidth=visibleHeight*camera.aspect;
  const area=targetViewport;
  const widthRatio=area?area.width/viewportWidth:1;
  const heightRatio=area?area.height/viewportHeight:1;
  const factor=Math.min(1,(visibleWidth*widthRatio*.72)/width,(visibleHeight*heightRatio*.68)/height);
  outer.scale.setScalar(factor);
  const center=box.getCenter(new THREE.Vector3());
  const dx=area?((area.x+area.width/2)/viewportWidth-.5)*visibleWidth:0;
  const dy=area?(.5-(area.y+area.height/2)/viewportHeight)*visibleHeight:0;
  outer.position.set(dx-center.x*factor,dy-center.y*factor,0);
 };
 const resize=(width,height)=>{
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Invalid Text3D viewport');
  if(width===viewportWidth&&height===viewportHeight)return;
  viewportWidth=width;viewportHeight=height;
  renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();fit();
 };
 const rebuildGeometry=(text)=>{
  const nextChars=[],nextMeshes=[];
  let cursor=0;
  try{
   for(const glyph of text3DGraphemes(text)){
    const wrapper=new THREE.Group();
    const geometry=new makeGeometry(glyph,{font:activeFont,size:fontSize,depth,curveSegments:12,bevelEnabled:true,bevelThickness:.018,bevelSize:.012,bevelSegments:3});
    geometry.computeBoundingBox();
    const width=geometry.boundingBox?geometry.boundingBox.max.x-geometry.boundingBox.min.x:.22;
    const mesh=new THREE.Mesh(geometry,[front,side]);
    mesh.position.set(-(geometry.boundingBox?.min.x??0),-.14,0);
    wrapper.add(mesh);wrapper.position.x=cursor;nextChars.push(wrapper);nextMeshes.push(mesh);
    cursor+=Math.max(.15,width)+letterSpacing+.055;
   }
  }catch(e){for(const mesh of nextMeshes)mesh.geometry.dispose();throw e}
  for(const mesh of meshes)mesh.geometry.dispose();
  for(const old of characters)root.remove(old);
  characters.splice(0,characters.length,...nextChars);
  meshes.splice(0,meshes.length,...nextMeshes);
  for(const child of characters)root.add(child);
  root.position.x=textAlign==='left'?0:textAlign==='right'?-cursor:-cursor/2;
  modelText=text;
  fit();
 };
 try{rebuildGeometry(String(options.text??''))}
 catch(error){front.dispose();side.dispose();renderer.dispose();throw error}
 const resources=new Text3DResourceManager();
 const motion=createText3DMotion({group:outer,characters:[]});
 const snapshot=o=>({position:o.position.clone(),rotation:o.rotation.clone(),scale:o.scale.clone()});
 const restore=(o,b)=>{o.position.copy(b.position);o.rotation.copy(b.rotation);o.scale.copy(b.scale)};
 let rootBaseline=snapshot(root);const cameraBaseline=snapshot(camera);let outerBaseline=snapshot(outer);
 let baseline=characters.map(snapshot);
 let duration=Number.isFinite(options.duration)&&options.duration>0?options.duration:10;
 let baseFront=front.color.clone(),baseSide=side.color.clone();
 const snapshotMaterial=m=>({color:m.color.clone(),emissive:m.emissive.clone(),emissiveIntensity:m.emissiveIntensity,opacity:m.opacity,transparent:m.transparent,roughness:m.roughness,metalness:m.metalness,visible:m.visible});
 const baseMaterial=[snapshotMaterial(front),snapshotMaterial(side)];
 const restoreMaterial=(m,b)=>{m.color.copy(b.color);m.emissive.copy(b.emissive);m.emissiveIntensity=b.emissiveIntensity;m.opacity=b.opacity;m.transparent=b.transparent;m.roughness=b.roughness;m.metalness=b.metalness;m.visible=b.visible};
 const baseLight=[{intensity:ambient.intensity,color:ambient.color.clone(),position:ambient.position.clone()},{intensity:key.intensity,color:key.color.clone(),position:key.position.clone()}];
 let userRotationX=0,userRotationY=0;
 const setRotation=(x,y)=>{
  if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error('Invalid 3D rotation');
  if(x===userRotationX&&y===userRotationY)return;
  userRotationX=x;userRotationY=y;
  orientation.rotation.set(THREE.MathUtils.degToRad(x),THREE.MathUtils.degToRad(y),0,'YXZ');
  fit();outerBaseline=snapshot(outer);
 };
 const run=async(t)=>{
  if(!Number.isFinite(t)||t<0)throw new Error('Invalid frame time');
  restore(root,rootBaseline);restore(camera,cameraBaseline);restore(outer,outerBaseline);
  characters.forEach((c,i)=>restore(c,baseline[i]));
  restoreMaterial(front,baseMaterial[0]);restoreMaterial(side,baseMaterial[1]);
  front.color.copy(baseFront);side.color.copy(baseSide);
  for(const [i,light] of [ambient,key].entries()){light.intensity=baseLight[i].intensity;light.color.copy(baseLight[i].color);light.position.copy(baseLight[i].position)}
  await motion.frame(t);
  const commands=await evaluateText3DAnimations(animations,t,(kind,index)=>({
   scene,camera,renderer,duration,model:{root,characters,meshes},materials:[front,side],
   resources:{track:resource=>resources.track(kind+':'+index,resource)}
  }));
  applyText3DContributions(commands,{root,characters,materials:[front,side],lights:[ambient,key]});
  renderer.render(scene,camera);
 };
 let disposed=false;
 return {
  contractVersion:2,renderer,scene,camera,
  model:{root,characters,meshes},
  appearance:{materials:[front,side],lights:[ambient,key]},
  animations,setRotation,setViewport(area){
   if(disposed)throw Error('Text3D disposed');
   if(area!==null && (!Number.isFinite(area?.x)||!Number.isFinite(area?.y)||
     !Number.isFinite(area?.width)||!Number.isFinite(area?.height)||area.width<=0||area.height<=0))
      throw Error('Invalid Text3D target viewport');
   if(JSON.stringify(area)===JSON.stringify(targetViewport))return;
   targetViewport=area?{x:area.x,y:area.y,width:area.width,height:area.height}:null;
   fit();outerBaseline=snapshot(outer);
  },setTypography(settings){
   if(disposed)throw Error('Text3D disposed');
   const nextFont=settings.font??activeFont;
   const nextSize=settings.fontSize??fontSize;
   const nextSpacing=settings.letterSpacing??letterSpacing;
   const nextAlign=settings.textAlign??textAlign;
   if(!nextFont||typeof nextFont.generateShapes!=='function')throw Error('Invalid Text3D font');
   if(!Number.isFinite(nextSize)||nextSize<=0||nextSize>100)throw Error('Invalid Text3D font size');
   if(!Number.isFinite(nextSpacing)||Math.abs(nextSpacing)>10)throw Error('Invalid Text3D letter spacing');
   if(!['left','center','right'].includes(nextAlign))throw Error('Invalid Text3D alignment');
   if(nextFont===activeFont&&nextSize===fontSize&&nextSpacing===letterSpacing&&nextAlign===textAlign)return;
   const old=[activeFont,fontSize,letterSpacing,textAlign];
   activeFont=nextFont;fontSize=nextSize;letterSpacing=nextSpacing;textAlign=nextAlign;
   try{rebuildGeometry(modelText);baseline=characters.map(snapshot);rootBaseline=snapshot(root);outerBaseline=snapshot(outer)}
   catch(e){[activeFont,fontSize,letterSpacing,textAlign]=old;throw e}
  },resize: (w,h)=>{resize(w,h);outerBaseline=snapshot(outer)},setText(text){if(disposed)throw Error('Text3D disposed');if(String(text)!==modelText){rebuildGeometry(String(text));baseline=characters.map(snapshot);rootBaseline=snapshot(root);outerBaseline=snapshot(outer)}},setDepth(value){if(disposed)throw Error('Text3D disposed');if(!Number.isFinite(value)||value<=0||value>10)throw Error('Invalid depth');if(value!==depth){depth=value;rebuildGeometry(modelText);baseline=characters.map(snapshot);rootBaseline=snapshot(root);outerBaseline=snapshot(outer)}},setDuration(value){if(!Number.isFinite(value)||value<=0)throw new Error('Invalid clip duration');duration=value},setBaseColor(color){front.color.set(color);side.color.copy(front.color).multiplyScalar(.48);baseFront=front.color.clone();baseSide=side.color.clone()},frame:async t=>{if(disposed)throw new Error('Text3D disposed');await run(t)},
  dispose(){
   if(disposed)return;disposed=true;
   const errors=[];
   for(const kind of ['native','motion','appearance','vfx'])for(const module of animations[kind])try{module.dispose?.()}catch(e){errors.push(e)}
   try{resources.releaseAll()}catch(e){errors.push(e)}
   for(const mesh of meshes)try{mesh.geometry.dispose()}catch(e){errors.push(e)}
   for(const object of [front,side,renderer])try{object.dispose()}catch(e){errors.push(e)}
   if(errors.length)throw new AggregateError(errors,'Text3D disposal errors');
  }
 };
}
