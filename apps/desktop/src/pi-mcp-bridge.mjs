/** Lightweight stdio MCP client for the embedded Pi agent.
 * Pi discovers a small subset of tools on demand instead of inserting the entire catalog into every prompt.
 * MCP execution remains exclusively in media-mcp.mjs, shared with ACP agents.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const MAX_LINE=12*1024*1024;
const MAX_ARGUMENTS=40*1024;
const MAX_RESPONSE=12*1024*1024;
const SCRIPT=fileURLToPath(new URL('./media-mcp.mjs',import.meta.url));

export class PiMcpBridge{
 constructor({cwd,script=SCRIPT,command=process.execPath,env=process.env}){
  this.cwd=cwd;this.script=script;this.command=command;this.env=env;
  this.pending=new Map();this.next=0;this.child=null;this.starting=null;this.catalog=null;this.reader=null;
 }
 async start(){
  if(this.catalog)return this.catalog;
  if(this.starting)return this.starting;
  this.starting=this._start().catch(error=>{this.close();throw error}).finally(()=>{this.starting=null});
  return this.starting;
 }
 async _start(){
  const child=spawn(this.command,[this.script],{
   cwd:this.cwd,env:{...this.env,VIDEOMAKER_PROJECT:this.cwd,ELECTRON_RUN_AS_NODE:'1'},
   stdio:['pipe','pipe','pipe'],windowsHide:true
  });
  this.child=child;
  let diagnostic='';
  child.stderr.on('data',bytes=>{diagnostic=(diagnostic+bytes.toString()).slice(-800)});
  child.once('error',error=>this._abort(error));
  child.once('close',code=>this._abort(Error('MCP server exited ('+code+'): '+diagnostic)));
  this.reader=createInterface({input:child.stdout,crlfDelay:Infinity});
  this.reader.on('line',line=>{
   if(line.length>MAX_LINE){this._abort(Error('MCP response exceeded limit'));return}
   let message;
   try{message=JSON.parse(line)}catch{return}
   const requested=this.pending.get(message.id);
   if(!requested)return;
   this.pending.delete(message.id);clearTimeout(requested.timer);
   if(message.error)requested.reject(Error(String(message.error.message??'MCP protocol failure')));
   else requested.resolve(message.result);
  });
  const info=await this.request('initialize',{protocolVersion:'2024-11-05',clientInfo:{name:'videomaker-pi',version:'1.0.0'},capabilities:{}},12000);
  if(!info?.capabilities?.tools)throw Error('MCP did not advertise tools');
  const list=await this.request('tools/list',{},12000);
  if(!Array.isArray(list?.tools)||list.tools.length===0)throw Error('MCP returned no tools');
  this.catalog=new Map(list.tools.map(t=>[t.name,t]));
  return this.catalog;
 }
 request(method,params={},timeout=30000){
  if(!this.child||this.child.exitCode!==null||this.child.killed)return Promise.reject(Error('MCP server is not running'));
  const id=++this.next;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{
    this.pending.delete(id);
    reject(Error('MCP '+method+' timed out'));
    this.close();
   },timeout);
   this.pending.set(id,{resolve,reject,timer});
   try{
    this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n',error=>{
     if(error){
      const waiting=this.pending.get(id);
      if(waiting){this.pending.delete(id);clearTimeout(timer);reject(error);this.close()}
     }
    });
   }catch(error){
    this.pending.delete(id);clearTimeout(timer);reject(error);this.close();
   }
  });
 }
 async discover(query='',limit=6){
  const tools=await this.start();
  if(typeof query!=='string'||query.length>100||!Number.isInteger(limit)||limit<1||limit>10)throw Error('Invalid MCP discovery query or limit');
  const exact=tools.get(query.trim());
  const words=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list=exact?[exact]:[...tools.values()].filter(t=>words.every(w=>(t.name+' '+t.description).toLowerCase().includes(w)));
  // A category search shows brief choices; requesting an exact tool name exposes only its schema.
  const chosen=list.slice(0,limit).map(t=>({name:t.name,description:String(t.description??'').slice(0,155),...(exact?{inputSchema:t.inputSchema}:{})}));
  return {total:list.length,tools:chosen,remaining:Math.max(0,list.length-chosen.length),...(exact?{schema_included:true}:{}),...(exact?{}:{next:'Request the exact tool name to read its arguments'})};
 }
 async call(name,args={}){
  const tools=await this.start();
  if(typeof name!=='string'||!tools.has(name))throw Error('Unknown MCP tool; discover it first');
  if(args===null||typeof args!=='object'||Array.isArray(args))throw Error('MCP arguments must be an object');
  if(Buffer.byteLength(JSON.stringify(args))>MAX_ARGUMENTS)throw Error('MCP arguments exceed 40 KB');
  const result=await this.request('tools/call',{name,arguments:args},3650000);
  if(result?.isError)throw Error((result.content??[]).filter(b=>b.type==='text').map(b=>b.text).join(' ').slice(0,900)||'MCP tool failed');
  const content=(result?.content??[]).filter(c=>c?.type==='text'||c?.type==='image').slice(0,5).map(c=>c.type==='text'?{type:'text',text:String(c.text??'').slice(0,40000)}:{type:'image',mimeType:c.mimeType??'image/png',data:c.data});
  if(Buffer.byteLength(JSON.stringify(content))>MAX_RESPONSE)throw Error('MCP tool result exceeded Pi transfer limit');
  return {content:content.length?content:[{type:'text',text:'Operation completed'}],details:{mcpTool:name}};
 }
 _abort(error){
  for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(error)}
  this.pending.clear();
  this.catalog=null;
  const child=this.child;
  this.child=null;
  if(child&&!child.killed){try{child.kill()}catch{/* already exited */}}
 }
 close(){
  this._abort(Error('MCP connection closed'));
  this.reader?.close();
  this.reader=null;
 }
}

export function piMcpTools(bridge){
 return [
  {name:'videomaker_tools',label:'Videomaker MCP tools',description:'Search native Videomaker MCP tools by category (compact names/descriptions), then query one exact tool name to get only its input schema. This saves context.',
   parameters:{type:'object',properties:{query:{type:'string',description:'Keyword or tool name fragment'},limit:{type:'integer',minimum:1,maximum:10}},additionalProperties:false},
   async execute(_id,params){const result=await bridge.discover(params?.query??'',params?.limit??6);return{content:[{type:'text',text:JSON.stringify(result)}],details:{}}}},
  {name:'videomaker_call',label:'Videomaker MCP',description:'Execute a native Videomaker MCP tool by name, using its exact input schema from videomaker_tools. Prefer this to terminal commands for native capabilities.',
   parameters:{type:'object',properties:{name:{type:'string'},arguments:{type:'object'}},required:['name'],additionalProperties:false},
   async execute(_id,params){return bridge.call(params?.name,params?.arguments??{})}}
 ];
}
