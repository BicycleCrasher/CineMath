// === V5.32.0: Time budget filter (Phase 3a of decision-helper roadmap) ===
// Extracted from app.js. Five buckets, escalating. parseRuntimeMin handles
// the various string formats stored across catalogs ("126 min", "1h 47m",
// "47", "5 series + 14 episodes"). For TV the runtime field is per-episode
// by convention so the budget compares per-episode, not series total. Items
// with unparseable runtime are kept (don't filter out the unknown).
// Golden cases: tests/fixtures/runtime-cases.json.
export const TIME_BUDGETS = {
  quick:    { max: 30,       label: 'Quick',    sub: '≤ 30 min' },
  short:    { max: 90,       label: 'Short',    sub: '≤ 90 min' },
  standard: { max: 120,      label: 'Standard', sub: '≤ 2 hours' },
  long:     { max: 180,      label: 'Long',     sub: '≤ 3 hours' },
  any:      { max: Infinity, label: 'All evening', sub: 'No limit' },
};

export function parseRuntimeMin(item) {
  if (!item) return null;
  const r = item.runtime;
  if (r == null) return null;
  if (typeof r === 'number') return r > 0 ? r : null;
  if (typeof r !== 'string') return null;
  const s = r.toLowerCase().trim();
  // "1h 47m" / "1 hr 47 min" / "1h47m" / "2 hours 6 minutes"
  const hm = s.match(/(\d+)\s*(?:h(?:r|our|ours)?)\s*(?:(\d+)\s*(?:m(?:in|inutes)?))?/);
  if (hm) {
    return parseInt(hm[1], 10) * 60 + (hm[2] ? parseInt(hm[2], 10) : 0);
  }
  // "47 min" / "47 minutes" / "47m" / leading "47" before non-numeric
  const m = s.match(/^(\d+)\s*(?:m(?:in|inutes)?)?(?:\s|$)/);
  if (m) {
    const v = parseInt(m[1], 10);
    return v > 0 ? v : null;
  }
  return null;
}

export function fitsTimeBudget(item, budget) {
  if (!budget || budget === 'any') return true;
  const cfg = TIME_BUDGETS[budget];
  if (!cfg || cfg.max === Infinity) return true;
  const mins = parseRuntimeMin(item);
  // Unparseable / unknown runtime → don't filter out (better false-positive than dropping items)
  if (mins == null) return true;
  return mins <= cfg.max;
}
