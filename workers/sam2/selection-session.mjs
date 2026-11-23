// Pure state transitions for the experimental Rotoscope stage tool.
// This module deliberately neither changes the document nor registers event listeners.
const valid = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
export const initialSelection = () => ({ active: null, marks: [] });
export function beginSelection(state, pointerId, point, mode) {
  if (!['box', 'include', 'exclude'].includes(mode) || !Number.isInteger(pointerId) || !valid(point)) throw new TypeError('Invalid selection');
  if (state.active) return state; // Never steal an existing gesture.
  return { ...state, active: { pointerId, from: { ...point }, to: { ...point }, mode } };
}
export function moveSelection(state, pointerId, point) {
  if (!state.active || state.active.pointerId !== pointerId) return state;
  if (!valid(point)) throw new TypeError('Invalid selection point');
  return { ...state, active: { ...state.active, to: { ...point } } };
}
export function finishSelection(state, pointerId, point, minDrag = 4) {
  if (!state.active || state.active.pointerId !== pointerId) return { state, result: null };
  const moved = moveSelection(state, pointerId, point);
  const { from, to, mode } = moved.active;
  const distance = Math.hypot(to.x-from.x, to.y-from.y);
  const result = mode === 'box'
    ? (distance >= minDrag && Math.abs(to.x-from.x) >= 1 && Math.abs(to.y-from.y) >= 1
      ? { kind: 'box', a: { ...from }, b: { ...to } } : null)
    : { kind: 'point', label: mode === 'include' ? 1 : 0, point: { ...to } };
  return { state: { ...moved, active: null, marks: result ? [...state.marks, result] : state.marks }, result };
}
export function cancelSelection(state) { return state.active ? { ...state, active: null } : state; }
export function clearSelection() { return initialSelection(); }
