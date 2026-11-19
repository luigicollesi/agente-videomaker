/** Compare the wire size of the complete MCP catalog with lazy Pi discovery.
 * Run: node apps/desktop/scripts/bench-mcp-discovery.mjs
 * JSON bytes are a context-size proxy, not a measurement of LLM tokens or response quality.
 */
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PiMcpBridge } from '../src/pi-mcp-bridge.mjs';

const bytes=x=>Buffer.byteLength(JSON.stringify(x));
const project=await mkdtemp(join(tmpdir(),'videomaker-mcp-bench-'));
const bridge=new PiMcpBridge({cwd:project});
try{
 const started=performance.now();
 const full=await bridge.start();
 const startedSearch=performance.now();
 const category=await bridge.discover('timeline',6);
 const afterCategory=performance.now();
 const exact=await bridge.discover('timeline_apply_batch',1);
 const afterExact=performance.now();
 if(full.size<40||category.tools.length<1||exact.tools.length!==1||!exact.tools[0].inputSchema)throw Error('Incomplete MCP catalog');
 const all=[...full.values()];
 const wholeBytes=bytes(all);
 const neededBytes=bytes(category)+bytes(exact);
 const report={
  measurement:'JSON wire bytes; not model tokens',
  available_tools:full.size,
  discovered_tools:category.tools.length,
  full_catalog_bytes:wholeBytes,
  selective_discovery_bytes:neededBytes,
  reduced_payload_percent:Math.round((1-neededBytes/wholeBytes)*1000)/10,
  initial_connection_ms:Math.round(startedSearch-started),
  category_lookup_ms:Math.round(afterCategory-startedSearch),
  exact_schema_lookup_ms:Math.round(afterExact-afterCategory)
 };
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
 if(neededBytes>=wholeBytes)throw Error('Selective discovery did not reduce JSON payload');
}finally{
 bridge.close();
 await rm(project,{recursive:true,force:true});
}
