// Pure, opt-in conversion between a displayed image viewport and original asset pixels.
// No DOM, timeline, Electron or model dependencies.
const finite = n => typeof n === 'number' && Number.isFinite(n);
export function imagePointFromStage({ x, y, frame, image }) {
  if (![x, y, frame?.x, frame?.y, frame?.width, frame?.height, image?.width, image?.height].every(finite))
    throw new TypeError('Coordinates and dimensions must be finite');
  if (frame.width <= 0 || frame.height <= 0 || image.width <= 0 || image.height <= 0)
    throw new RangeError('Dimensions must be positive');
  const u = (x - frame.x) / frame.width;
  const v = (y - frame.y) / frame.height;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
  return [Math.min(image.width - 1, Math.floor(u * image.width)),
    Math.min(image.height - 1, Math.floor(v * image.height))];
}
export function imageBoxFromStage({ a, b, frame, image }) {
  const lowX = Math.min(a?.x, b?.x), lowY = Math.min(a?.y, b?.y);
  const highX = Math.max(a?.x, b?.x), highY = Math.max(a?.y, b?.y);
  if (![lowX, lowY, highX, highY].every(finite)) throw new TypeError('Invalid box');
  if (highX <= lowX || highY <= lowY) throw new RangeError('Box must have positive area');
  if (![frame?.x, frame?.y, frame?.width, frame?.height, image?.width, image?.height].every(finite))
    throw new TypeError('Invalid dimensions');
  if (frame.width <= 0 || frame.height <= 0 || image.width <= 0 || image.height <= 0)
    throw new RangeError('Dimensions must be positive');
  const x1 = Math.max(frame.x, lowX), y1 = Math.max(frame.y, lowY);
  const x2 = Math.min(frame.x + frame.width, highX);
  const y2 = Math.min(frame.y + frame.height, highY);
  if (x2 <= x1 || y2 <= y1) return null;
  const scaleX = image.width / frame.width, scaleY = image.height / frame.height;
  return [
    Math.max(0, Math.floor((x1 - frame.x) * scaleX)),
    Math.max(0, Math.floor((y1 - frame.y) * scaleY)),
    Math.min(image.width, Math.ceil((x2 - frame.x) * scaleX)),
    Math.min(image.height, Math.ceil((y2 - frame.y) * scaleY)),
  ];
}
