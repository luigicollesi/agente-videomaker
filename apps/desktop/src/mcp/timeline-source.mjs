/** Timeline-only source resolution. Preserve the existing assets-only media validator;
 * additionally allow project-local procedural HTML pages without depending on assets/.
 */
import { realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

const inside=rel=>rel&&rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel);
const protectedSegment=part=>part==='.'||part==='..'||part.startsWith('.');

/** Return a project-relative, POSIX-style clip source. Do not write files.
 * @param {string} project
 * @param {string} raw
 * @param {(path:string) => Promise<string>} validateMedia Existing assets-only validator.
 */
export async function timelineSource(project,raw,validateMedia){
 if(typeof raw!=='string'||!raw.trim())throw Error('Missing timeline source path');
 const requested=resolve(project,raw);
 if(extname(requested).toLowerCase()!=='.html'){
  // In particular, audio, images and video keep their preexisting assets-only policy.
  const file=await validateMedia(raw);
  return relative(project,file).split(sep).join('/');
 }
 const base=await realpath(project);
 const lexical=relative(resolve(project),requested);
 if(!inside(lexical)||lexical.split(sep).some(protectedSegment)||lexical.toLowerCase()==='film.html')
  throw Error('HTML page must be inside this project, outside film.html and hidden tool folders');
 const canonical=await realpath(requested);
 const rel=relative(base,canonical);
 if(!inside(rel)||rel.split(sep).some(protectedSegment)||
    canonical!==resolve(base,lexical))
  throw Error('HTML page cannot escape the project or use symbolic-link aliases');
 if(!(await stat(canonical)).isFile())throw Error('HTML page must be a regular file');
 return rel.split(sep).join('/');
}
