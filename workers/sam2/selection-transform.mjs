// Optional Rotoscope selection geometry. Conventions match Studio stage-mask.toLocal.
// StageFrame: center cx/cy, displayed width/height, clockwise rotation r in degrees.
// SourceRect: pixels in original image, including crop/object-fit mapping supplied by Studio.
// No DOM, renderer, timeline or MCP imports.
const finite = n => typeof n === 'number' && Number.isFinite(n);
function check(frame, source, region) {
  if (![frame?.cx,frame?.cy,frame?.w,frame?.h,frame?.r,source?.width,source?.height,
    region?.x,region?.y,region?.width,region?.height].every(finite))
    throw new TypeError('Non-finite Rotoscope geometry');
  if (frame.w <= 0 || frame.h <= 0 || source.width <= 0 || source.height <= 0 ||
      region.width <= 0 || region.height <= 0 ||
      region.x < 0 || region.y < 0 || region.x+region.width > source.width ||
      region.y+region.height > source.height) throw new RangeError('Invalid geometry bounds');
}
export function toSourcePoint(point, frame, source, sourceRegion = {x:0,y:0,width:source.width,height:source.height}) {
  check(frame,source,sourceRegion);
  if (![point?.x, point?.y].every(finite)) throw new TypeError('Invalid stage point');
  const angle = -frame.r*Math.PI/180, c = Math.cos(angle), s = Math.sin(angle);
  const dx = point.x-frame.cx, dy = point.y-frame.cy;
  const localX = dx*c-dy*s+frame.w/2, localY = dx*s+dy*c+frame.h/2;
  if (localX < 0 || localY < 0 || localX >= frame.w || localY >= frame.h) return null;
  const x = Math.floor(sourceRegion.x+localX/frame.w*sourceRegion.width);
  const y = Math.floor(sourceRegion.y+localY/frame.h*sourceRegion.height);
  return [Math.max(0,Math.min(source.width-1,x)),Math.max(0,Math.min(source.height-1,y))];
}
// For rotated frames, screen-aligned drags are not axis-aligned in image space.
// Return source-space polygon; caller may derive a prompt box from its bounds.
export function toSourcePolygon(corners, frame, source, region) {
  if (!Array.isArray(corners) || corners.length < 3) throw new TypeError('Expected polygon with 3+ vertices');
  const projected = corners.map(point => toSourcePoint(point, frame, source, region));
  // Reject partial polygons: ignoring outside vertices could produce an incorrect mask.
  return projected.includes(null) ? null : projected;
}
export function sourcePolygonBounds(polygon, source) {
  if (polygon === null) return null;
  if (!Array.isArray(polygon) || polygon.length < 3 || polygon.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(finite)))
    throw new TypeError('Invalid source polygon');
  const points = polygon;
  if (![source?.width, source?.height].every(finite) || source.width <= 0 || source.height <= 0) throw new RangeError('Invalid source dimensions');
  if (points.some(([x,y]) => x < 0 || y < 0 || x >= source.width || y >= source.height)) throw new RangeError('Polygon outside source');
  const left = Math.min(...points.map(p => p[0])), top = Math.min(...points.map(p => p[1]));
  const right = Math.min(source.width,Math.max(...points.map(p => p[0]))+1);
  const bottom = Math.min(source.height,Math.max(...points.map(p => p[1]))+1);
  return right>left && bottom>top ? [left,top,right,bottom] : null;
}
