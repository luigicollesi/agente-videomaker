export type Motion={id:string;type:'rotate3d'|'scale'|'translate3d';start:number;duration:number;axis?:'x'|'y'|'z';turns?:number;to?:number;x?:number;y?:number;z?:number};
export function parseMotions(raw:string):Motion[]{
 let value=raw.trim();if((value[0]==="'"&&value.at(-1)==="'")||(value[0]==='"'&&value.at(-1)==='"'))value=value.slice(1,-1);
 try{const list:unknown=JSON.parse(value);return Array.isArray(list)?list.filter((m):m is Motion=>m&&typeof m==='object'&&typeof m.id==='string'&&['rotate3d','scale','translate3d'].includes(m.type)&&Number.isFinite(m.start)&&Number.isFinite(m.duration)&&m.duration>0).slice(0,64):[]}catch{return []}
}
export const encodeMotions=(m:Motion[])=>"'"+JSON.stringify(m).replace(/'/g,"\\'")+"'";
