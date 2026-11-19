/** Board management through authenticated native Studio routes. */
import { listBoards, readCanvas, canvasRevision } from 'openfilm/studio-canvas';
import { studioRequest } from './captions.mjs';

const boardId=value=>typeof value==='string'&&/^(?:main|[a-z0-9]{1,32})$/.test(value);
const revision=value=>typeof value==='string'&&/^[a-f0-9]{16}$/.test(value);
export function boardActionArgs(args){
 if(!args||typeof args!=='object'||Array.isArray(args)||!['create','rename','delete'].includes(args.action))throw Error('Invalid Canvas board action');
 if(args.action==='create'){
  if(typeof args.name!=='string'||!args.name.trim()||args.name.length>80)throw Error('Board name must be 1 to 80 characters');
  if(args.from!==undefined&&!boardId(args.from))throw Error('Invalid source board');
  if(args.from_revision!==undefined&&!revision(args.from_revision))throw Error('Invalid source board revision');
 }else{
  if(!boardId(args.board)||!revision(args.revision))throw Error('Board and revision required');
  if(args.action==='rename'&&(typeof args.name!=='string'||!args.name.trim()||args.name.length>80))throw Error('Invalid new board name');
  if(args.action==='delete'&&args.confirm_delete!==true)throw Error('Explicit deletion confirmation required');
 }
 return args;
}
export async function manageBoard(project,raw){
 const args=boardActionArgs(raw);
 const boards=await listBoards(project);
 if(args.action==='create'){
  if(boards.length>=100)throw Error('Canvas already has the maximum 100 boards');
  if(args.from&&!boards.some(x=>x.id===args.from))throw Error('Source board not found');
  if(args.from_revision&&canvasRevision(await readCanvas(project,args.from))!==args.from_revision)throw Error('Source board revision changed');
  const response=await studioRequest(project,'canvases','POST',{name:args.name.trim(),...(args.from?{from:args.from,from_revision:args.from_revision}: {})});
  return {status:'created',board:response.id,name:response.name??args.name.trim()};
 }
 if(!boards.some(x=>x.id===args.board))throw Error('Canvas board not found');
 const current=await readCanvas(project,args.board);
 if(canvasRevision(current)!==args.revision)throw Error('Board revision changed; read it again');
 if(args.action==='rename'){
  const saved=await studioRequest(project,'canvases/'+args.board,'PATCH',{name:args.name.trim(),revision:args.revision});
  return {status:'renamed',board:saved.id,name:saved.name??args.name.trim()};
 }
 if(boards.length<2)throw Error('Cannot delete the only board');
 const result=await studioRequest(project,'canvases/'+args.board,'DELETE',{revision:args.revision});
 return {status:'deleted',board:args.board,remaining_boards:(result.boards??[]).map(b=>({id:b.id,name:b.name??'',nodes:b.nodes??0})).slice(0,100)};
}
