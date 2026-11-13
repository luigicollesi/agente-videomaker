/** The Studio and CLI share the exact same conservative conversion planner. */
import { replacementEdits } from '../../../../src/text3d-replace.mjs';
import type { FilmOverride } from './film';

export interface Text3DClip {
  id: string;
  src: string;
  time?: number[];
  attrs?: Record<string,string>;
  overrides?: FilmOverride[];
}
export interface Text3DRegistered {
  componentId: string;
  bundlePath: string;
  source2DId: string;
  displayName: string;
  version: string;
  parameterMap: Record<string,string>;
}
export function planText3DApply(source: Text3DClip, destination: Text3DClip, registry: Text3DRegistered, durationSeconds: number) {
  if (!source.id || !destination.src || !Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new Error('Invalid Text3D conversion clip');
  // The registry is authoritative: use its metadata rather than relying on Saved attrs.
  const target: Text3DClip = {
    ...destination,
    attrs: {
      ...destination.attrs,
      'data-text3d-source-id': registry.source2DId,
      'data-text3d-version': registry.version,
    },
  };
  return replacementEdits(source, target, registry.parameterMap, durationSeconds);
}
