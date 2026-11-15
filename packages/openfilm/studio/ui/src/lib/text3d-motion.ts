export type Motion = {
  id: string;
  type: 'rotate3d' | 'scale' | 'translate3d';
  start: number;
  duration: number;
  axis?: 'x' | 'y' | 'z';
  turns?: number;
  to?: number;
  x?: number;
  y?: number;
  z?: number;
};

const valid = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** CSS custom properties preserve quote marks; strip only one matching layer. */
export function parseMotions(raw: string): Motion[] {
  let value = raw.trim();
  if ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))) {
    value = value.slice(1, -1);
    if (raw.trim().startsWith('"')) {
      try { value = JSON.parse(raw.trim()); } catch { return []; }
    }
  }
  try {
    const data: unknown = JSON.parse(value);
    if (!Array.isArray(data)) return [];
    const used = new Set<string>();
    const events: Motion[] = [];
    for (const item of data) {
      if (!valid(item) || typeof item.id !== 'string' || !item.id ||
          used.has(item.id) || !['rotate3d','scale','translate3d'].includes(String(item.type)) ||
          !finite(item.start) || item.start < 0 ||
          !finite(item.duration) || item.duration <= 0) continue;
      const motion: Motion = {
        id: item.id,
        type: item.type as Motion['type'],
        start: item.start,
        duration: item.duration,
      };
      if (motion.type === 'rotate3d') {
        if (item.axis !== 'x' && item.axis !== 'y' && item.axis !== 'z') continue;
        if (!finite(item.turns) || Math.abs(item.turns) > 20) continue;
        motion.axis = item.axis; motion.turns = item.turns;
      } else if (motion.type === 'scale') {
        if (!finite(item.to) || item.to < 0 || item.to > 10) continue;
        motion.to = item.to;
      } else {
        if (!finite(item.x) || !finite(item.y) || !finite(item.z)) continue;
        motion.x = item.x; motion.y = item.y; motion.z = item.z;
      }
      events.push(motion); used.add(item.id);
      if (events.length === 64) break;
    }
    return events;
  } catch { return []; }
}
/** CSS single-quoted string, with apostrophes escaped as CSS escapes. */
export const encodeMotions = (motions: Motion[]): string =>
  "'" + JSON.stringify(motions).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
