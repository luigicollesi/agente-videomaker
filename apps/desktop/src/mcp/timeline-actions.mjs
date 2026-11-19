/**
 * Strict MCP-facing subset of the Studio operations. No arbitrary file writes,
 * CSS injection or raw `fields` / `keyframes` operations.
 */
const number=(v,min=-Infinity,max=Infinity)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[A-Za-z][\w-]{0,79}$/.test(v);
const index=v=>Number.isInteger(v)&&v>=0&&v<=1000;
const fields=(value,allowed)=>Object.keys(value).every(key=>allowed.includes(key));
const fail=message=>{throw Error(message)};

export function propertyEdit(entry){
 if(!object(entry)||!fields(entry,['clip','prop','value'])||!id(entry.clip)||typeof entry.prop!=='string'||!Object.hasOwn(entry,'value'))fail('Invalid clip property edit');
 const {clip,prop,value}=entry;
 const nullable=value===null;
 let valid=false;
 switch(prop){
  case 'at': valid=nullable||number(value,0,86400);break;
  case 'start': valid=nullable||number(value,0,86400);break;
  case 'end': valid=nullable||number(value,0.001,86400);break;
  case 'speed': valid=nullable||number(value,0.1,100);break;
  case 'volume': valid=nullable||number(value,0,4);break;
  case 'fade': valid=nullable||(Array.isArray(value)&&value.length===2&&value.every(v=>number(v,0,86400)));break;
  case 'disabled': valid=nullable||typeof value==='boolean';break;
  case 'box':{
   valid=nullable||(object(value)&&fields(value,['x','y','w','h','r'])&&number(value.x,-100000,100000)&&number(value.y,-100000,100000)&&(!Object.hasOwn(value,'w')||number(value.w,0.001,100000))&&(!Object.hasOwn(value,'h')||number(value.h,0.001,100000))&&(!Object.hasOwn(value,'r')||number(value.r,-36000,36000)));
   break;
  }
  case 'size': valid=nullable||(object(value)&&fields(value,['w','h'])&&Object.keys(value).length===2&&Number.isInteger(value.w)&&Number.isInteger(value.h)&&number(value.w,1,8192)&&number(value.h,1,8192));break;
  case 'motion':{
   valid=nullable||(object(value)&&fields(value,['translate','scale','rotate','opacity'])&&Object.keys(value).length<=4&&Object.values(value).every(keys=>Array.isArray(keys)&&keys.length<=40&&keys.every(key=>{
    if(!object(key)||!fields(key,['t','v','ease'])||!number(key.t,0,86400)||!(key.ease===undefined||['linear','ease-in','ease-out','ease-in-out','hold'].includes(key.ease)))return false;
    if(Array.isArray(key.v))return key.v.length===2&&key.v.every(v=>number(v,-100000,100000));
    return number(key.v,-100000,100000);
   }))&&Object.entries(value).every(([name,keys])=>keys.every(key=>name==='translate'?Array.isArray(key.v):!Array.isArray(key.v) && (name==='opacity'?number(key.v,0,1):name==='scale'?number(key.v,0.001,1000):true))));
   break;
  }
 }
 if(!valid)fail('Unsupported or invalid clip property: '+prop);
 return {clip,prop,value:nullable&&prop==='motion'?{}:value};
}
export function propertyEdits(edits){
 if(!Array.isArray(edits)||edits.length<1||edits.length>30)fail('Expected 1 to 30 property edits');
 if(Buffer.byteLength(JSON.stringify(edits))>25000)fail('Clip property edit exceeds 25 KB');
 return edits.map(propertyEdit);
}
export async function batchOps(steps,safeAsset){
 if(!Array.isArray(steps)||steps.length<1||steps.length>25)fail('Expected 1 to 25 timeline steps');
 if(Buffer.byteLength(JSON.stringify(steps))>25000)fail('Timeline batch exceeds 25 KB');
 const ops=[];
 for(const step of steps){
  if(!object(step)||typeof step.op!=='string')fail('Invalid timeline step');
  switch(step.op){
   case 'move':
    if(!fields(step,['op','clip','at','track'])||!id(step.clip)||!number(step.at,0,86400)||(step.track!==undefined&&!index(step.track)))fail('Invalid move step');
    ops.push({op:'move',clip:step.clip,at:step.at,...(step.track===undefined?{}:{track:step.track})});
    break;
   case 'duplicate':
    if(!fields(step,['op','from','at','track'])||!id(step.from)||!number(step.at,0,86400)||(step.track!==undefined&&!index(step.track)))fail('Invalid duplicate step');
    ops.push({op:'insert',from:step.from,at:step.at,...(step.track===undefined?{}:{track:step.track})});
    break;
   case 'remove':
    if(!fields(step,['op','clip'])||!id(step.clip))fail('Invalid remove step');
    ops.push({op:'remove',clip:step.clip});
    break;
   case 'insert_asset':{
    if(!fields(step,['op','path','at','time','track','id'])||typeof step.path!=='string'||!step.path.trim()||!number(step.at,0,86400)||(step.track!==undefined&&!index(step.track))||(step.id!==undefined&&!id(step.id)))fail('Invalid insert step');
    if(step.time!==undefined&&(!Array.isArray(step.time)||step.time.length!==2||!number(step.time[0],0,86400)||!number(step.time[1],0.001,86400)||step.time[1]<=step.time[0]))fail('Invalid source trim');
    const src=await safeAsset(step.path);
    const clip={src,...(step.id?{id:step.id}:{}),...(step.time?{time:step.time}:{})};
    ops.push({op:'insert',clip,at:step.at,...(step.track===undefined?{}:{track:step.track})});
    break;
   }
   case 'props':
    if(!fields(step,['op','edits']))fail('Invalid props step');
    ops.push({op:'props',edits:propertyEdits(step.edits)});
    break;
   case 'track':
    if(!fields(step,['op','track','field','value'])||!index(step.track)||!['locked','hidden','muted'].includes(step.field)||typeof step.value!=='boolean')fail('Invalid track step');
    ops.push({op:'track',track:step.track,field:step.field,value:step.value});
    break;
   case 'stage':
    if(!fields(step,['op','w','h'])||!Number.isInteger(step.w)||!Number.isInteger(step.h)||!number(step.w,1,8192)||!number(step.h,1,8192))fail('Invalid stage dimensions');
    ops.push({op:'stage',w:step.w,h:step.h});
    break;
   default:fail('Unsupported timeline batch operation: '+step.op);
  }
 }
 return ops;
}
