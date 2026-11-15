// @ts-check
/** Runtime-independent Text3D manifest and component contract validation. */
const id=/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/i;
const local=/^\.\/(?!.*(?:\/\.\.|\\|\?))[-a-z0-9_./]+$/i;
const kinds=['native','motion','appearance','vfx'];
/** @param {unknown} value */
export function validateText3D(value){
 const issues=[];
 const m=/** @type {any} */(value);
 if(!m||typeof m!=='object'||Array.isArray(m))return ['manifest must be an object'];
 if(m.contractVersion!==2)issues.push('contractVersion must be 2');
 if(m.runtime!=='three-webgl')issues.push('runtime must be three-webgl');
 if(typeof m.id!=='string'||!id.test(m.id))issues.push('invalid id');
 if(m.version!==undefined)issues.push('version must be omitted');
 if(typeof m.source2DId!=='string'||!id.test(m.source2DId))issues.push('invalid source2DId');
 if(m.model?.type!=='extruded-text')issues.push('model.type must be extruded-text');
 if(typeof m.model?.font!=='string'||!local.test(m.model.font))issues.push('model.font must be a bundled relative path');
 if(m.typography!==undefined){
  if(!m.typography||typeof m.typography!=='object'||Array.isArray(m.typography))issues.push('typography must be an object');
  else {
   const fonts=m.typography.fonts??{};
   if(!fonts||typeof fonts!=='object'||Array.isArray(fonts))issues.push('typography.fonts must be an object');
   else for(const [family,path] of Object.entries(fonts))
    if(!family||typeof path!=='string'||!local.test(path)||!path.endsWith('.json'))issues.push('invalid typography font: '+family);
  }
 }
 if(!m.timeline||m.timeline.durationSource!=='clip'||m.timeline.deterministic!==true)issues.push('timeline must follow deterministic clip time');
 for(const kind of kinds){
  if(!Array.isArray(m.modules?.[kind])){issues.push('modules.'+kind+' must be an array');continue}
  for(const module of m.modules[kind])if(typeof module!=='string'||!local.test(module))issues.push('invalid module path in '+kind);
 }
 if(!Array.isArray(m.props)||!m.props.some(p=>p?.type==='text'))issues.push('editable text prop required');
 if(!m.parameterMap||typeof m.parameterMap!=='object'||Array.isArray(m.parameterMap))issues.push('parameterMap required');
 return issues;
}
/** @param {any} component */
export function validateText3DInstance(component){
 const errors=[];
 if(component?.contractVersion!==2)errors.push('runtime contractVersion missing');
 const renderer=component?.renderer;
 if(!renderer?.isWebGLRenderer)errors.push('THREE.WebGLRenderer required');
 if(!component?.scene?.isScene)errors.push('THREE.Scene required');
 if(!component?.camera?.isCamera)errors.push('THREE.Camera required');
 if(!component?.model?.root?.isGroup)errors.push('model.root THREE.Group required');
 if(!Array.isArray(component?.model?.characters))errors.push('model.characters required');
 if(!Array.isArray(component?.model?.meshes)||!component.model.meshes.some(m=>m?.isMesh&&m.geometry?.isBufferGeometry))errors.push('real mesh geometry required');
 for(const key of ['native','motion','appearance','vfx']){
  if(!Array.isArray(component?.animations?.[key]))errors.push('animations.'+key+' required');
 }
 if(typeof component?.frame!=='function'||typeof component?.dispose!=='function')errors.push('frame/dispose required');
 return errors;
}
