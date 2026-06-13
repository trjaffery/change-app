// Deterministic next-session target for an exercise based on the last few
// sessions. Replaces an earlier AI-based suggestion that gave unpredictable
// answers for what is, fundamentally, a progressive-overload rule.

export interface HistorySession {
  date: string;
  sets: { reps: number; weight: number }[];
}

export interface Suggestion { sets: number; reps: number; weight: number; notes: string }

// Small-jump exercises get +2.5 lb instead of +5 lb when progressing. Bench
// row, isolations etc. — anything where 5 lb is too big a jump.
const SMALL_JUMP_RE = /curl|raise|fly|extension|kickback/i;

function parseTargetReps(target: string): number {
  // Accepts "8", "8-12", "8 to 12". We progress when the user hits the LOW end.
  const m = target.match(/(\d+)/);
  return m ? Number(m[1]) : 8;
}

// "Hit target" = the heaviest working set in the session had reps ≥ targetLow.
function sessionHitTarget(s: HistorySession, targetLow: number): { hit: boolean; topWeight: number } {
  if (!s.sets.length) return { hit: false, topWeight: 0 };
  const top = s.sets.reduce((a, b) => (b.weight > a.weight ? b : a));
  return { hit: top.reps >= targetLow, topWeight: top.weight };
}

function roundJump(weight: number): number {
  return Math.round(weight / 5) * 5;
}

export function suggestNext(
  exercise: string,
  history: HistorySession[],
  targetSets: number,
  targetRepsStr: string,
): Suggestion | null {
  const targetLow = parseTargetReps(targetRepsStr);
  const jump = SMALL_JUMP_RE.test(exercise) ? 2.5 : 5;

  if (history.length === 0) {
    return null;
  }

  const last = sessionHitTarget(history[history.length - 1], targetLow);
  if (history.length === 1) {
    if (last.hit) {
      return { sets: targetSets, reps: targetLow, weight: roundJump(last.topWeight + jump), notes: `Hit target last time — +${jump} lb` };
    }
    return { sets: targetSets, reps: targetLow, weight: last.topWeight, notes: 'Repeat last weight until you hit target reps' };
  }

  const prev = sessionHitTarget(history[history.length - 2], targetLow);

  if (last.hit) {
    return { sets: targetSets, reps: targetLow, weight: roundJump(last.topWeight + jump), notes: `Hit target last time — +${jump} lb` };
  }

  // Last failed. If the one before hit, repeat last weight.
  if (prev.hit) {
    return { sets: targetSets, reps: targetLow, weight: last.topWeight, notes: 'Repeat last weight — earn the rep target again' };
  }

  // Two failures in a row → deload.
  const deload = roundJump(last.topWeight * 0.9);
  return { sets: targetSets, reps: targetLow, weight: deload, notes: `Deload to 90% (${deload} lb) after 2 stalled sessions` };
}
