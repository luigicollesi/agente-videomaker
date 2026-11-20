// Optional Rotoscope worker contract. No dependency on Studio or MCP.
import { resolve } from 'node:path';

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
export function validateSegmentRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new TypeError('Expected request object');
  for (const key of ['input', 'checkpoint', 'outputMask']) {
    if (typeof request[key] !== 'string' || !request[key].trim()) throw new TypeError(`Invalid ${key}`);
  }
  const hasPoints = request.points !== undefined;
  const hasBox = request.box !== undefined;
  if (!hasPoints && !hasBox) throw new TypeError('Provide box or points');
  if (hasPoints && (!Array.isArray(request.points) || !request.points.length || !request.points.every(p => Array.isArray(p) && p.length === 2 && p.every(n => finite(n) && n >= 0)))) {
    throw new TypeError('points must be [[x,y],...] with nonnegative finite coordinates');
  }
  if (hasPoints && (!Array.isArray(request.labels) || request.labels.length !== request.points.length || !request.labels.every(n => n === 0 || n === 1))) {
    throw new TypeError('labels must have one 0/1 entry per point');
  }
  if (hasBox && (!Array.isArray(request.box) || request.box.length !== 4 || !request.box.every(finite) || request.box[0] < 0 || request.box[1] < 0 || request.box[2] <= request.box[0] || request.box[3] <= request.box[1])) {
    throw new TypeError('Invalid box coordinates');
  }
  if (request.device !== undefined && !['auto', 'cpu', 'cuda'].includes(request.device)) throw new TypeError('Invalid device');
  if (request.outputRgba !== undefined && (typeof request.outputRgba !== 'string' || !request.outputRgba.trim())) throw new TypeError('Invalid outputRgba');
  const paths = [request.input, request.checkpoint, request.outputMask, ...(request.outputRgba ? [request.outputRgba] : [])].map(p => resolve(p));
  if (new Set(paths).size !== paths.length) throw new TypeError('Input and output paths must all be distinct');
  return Object.freeze({
    input: paths[0], checkpoint: paths[1], outputMask: paths[2],
    ...(request.outputRgba ? { outputRgba: paths[3] } : {}),
    ...(hasPoints ? { points: request.points.map(p => [...p]), labels: [...request.labels] } : {}),
    ...(hasBox ? { box: [...request.box] } : {}),
    device: request.device ?? 'auto',
  });
}
export function segmentArgs(r) {
  const args = ['--input', r.input, '--checkpoint', r.checkpoint, '--output-mask', r.outputMask, '--device', r.device];
  if (r.outputRgba) args.push('--output-rgba', r.outputRgba);
  if (r.points) args.push('--points', JSON.stringify(r.points), '--labels', JSON.stringify(r.labels));
  if (r.box) args.push('--box', JSON.stringify(r.box));
  return args;
}
