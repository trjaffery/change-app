import type { SupabaseClient } from '@supabase/supabase-js';

export interface Correlation {
  id: string;
  finding: string;
  strength: 'strong' | 'moderate' | 'weak';
  samples: { a: number; b: number };
  confidence: 'high' | 'low';
}

interface DailyRecord {
  date: string;
  workedOut: boolean;
  gymVolume: number;
  urgeCount: number;
  urgeIntensitySum: number; // sum of intensities; per-urge avg = sum / count
  relapsed: boolean;
  habitDone: number;
  habitDue: number;
  habitMet: Set<string>; // habit_ids whose daily count met goal_value that day
  goalsDone: number;
  goalsTotal: number;
  dow: number; // 0=Sun..6=Sat
}

const MIN_SAMPLES = 5;
// Cohen's d effect sizes: 0.2 small, 0.5 medium, 0.8 large.
const D_STRONG = 0.8;
const D_MODERATE = 0.5;
const D_WEAK = 0.3; // a tiny bit looser than Cohen's "small" so we don't drop everything

function utcDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function isDue(
  habit: { schedule_type: string; schedule_days: number[] | null },
  dateStr: string,
): boolean {
  const d = new Date(dateStr + 'T12:00:00Z');
  if (habit.schedule_type === 'specific_days_week') return habit.schedule_days?.includes(d.getUTCDay()) ?? false;
  if (habit.schedule_type === 'specific_days_month') return habit.schedule_days?.includes(d.getUTCDate()) ?? false;
  return true;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
}

// Cohen's d with pooled standard deviation. Returns Infinity when both groups have
// no variance but differ in mean (perfect separation); 0 when means are equal.
function cohensD(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0;
  const mA = mean(a);
  const mB = mean(b);
  const vA = variance(a);
  const vB = variance(b);
  const pooledSd = Math.sqrt((vA + vB) / 2);
  if (pooledSd === 0) return mA === mB ? 0 : Infinity;
  return (mA - mB) / pooledSd;
}

function strengthFromD(d: number): Correlation['strength'] | null {
  const a = Math.abs(d);
  // Infinity (perfect separation w/ zero variance) is suspicious — demote to moderate
  // unless both groups have meaningful sample size, in which case caller decides.
  if (!isFinite(a)) return 'moderate';
  if (a >= D_STRONG) return 'strong';
  if (a >= D_MODERATE) return 'moderate';
  if (a >= D_WEAK) return 'weak';
  return null;
}

// Pearson correlation for continuous-vs-continuous (e.g. habit rate vs urge count).
function pearson(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 3) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

function strengthFromR(r: number): Correlation['strength'] | null {
  const a = Math.abs(r);
  if (a >= 0.5) return 'strong';
  if (a >= 0.35) return 'moderate';
  if (a >= 0.25) return 'weak';
  return null;
}

// Linear-regression slope (least squares). Used for trend detection.
function slope(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 3) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

// A day is "active" if the user did literally anything that day. Inactive days
// would otherwise anchor a bucket at 0 and produce phantom "strong" findings.
function isActive(r: DailyRecord): boolean {
  return r.habitDone > 0 || r.workedOut || r.urgeCount > 0 || r.relapsed || r.goalsTotal > 0;
}

const DOW_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

export async function computeCorrelations(sb: SupabaseClient, windowDays = 30): Promise<Correlation[]> {
  const now = Date.now();
  const startStr = utcDate(new Date(now - (windowDays - 1) * 86400000));
  const startIso = new Date(now - (windowDays - 1) * 86400000).toISOString();

  const [habitsRes, completionsRes, sessionsRes, setsRes, urgesRes, relapsesRes, goalsRes] = await Promise.all([
    sb.from('habits').select('id, name, schedule_type, schedule_days, goal_value, goal_period').is('archived_at', null),
    sb.from('habit_completions').select('habit_id, date, count').gte('date', startStr),
    sb.from('gym_sessions').select('date').gte('date', startStr),
    sb.from('gym_sets').select('date, reps, weight').gte('date', startStr),
    sb.from('recovery_urges').select('intensity, created_at').gte('created_at', startIso),
    sb.from('recovery_relapses').select('created_at').gte('created_at', startIso),
    sb.from('goals').select('date, done').gte('date', startStr),
  ]);

  const habits = (habitsRes.data ?? []) as {
    id: string; name: string;
    schedule_type: string; schedule_days: number[] | null;
    goal_value: number; goal_period: string;
  }[];

  // Build empty daily records for the full window.
  const records = new Map<string, DailyRecord>();
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(now - i * 86400000);
    const ds = utcDate(d);
    records.set(ds, {
      date: ds,
      workedOut: false,
      gymVolume: 0,
      urgeCount: 0,
      urgeIntensitySum: 0,
      relapsed: false,
      habitDone: 0,
      habitDue: 0,
      habitMet: new Set<string>(),
      goalsDone: 0,
      goalsTotal: 0,
      dow: d.getUTCDay(),
    });
  }

  // Habits due per day (using current active habits' schedules).
  for (const [ds, rec] of records) {
    rec.habitDue = habits.filter(h => isDue(h, ds)).length;
  }

  // Habit completions — track which specific habits met their goal each day.
  // A habit "met" means daily count >= goal_value (for daily-period habits;
  // for weekly/monthly the per-day threshold isn't meaningful, so skip).
  const dailyHabitCount = new Map<string, Map<string, number>>(); // date -> habit_id -> count
  for (const c of (completionsRes.data ?? [])) {
    if (!records.has(c.date)) continue;
    const m = dailyHabitCount.get(c.date) ?? new Map<string, number>();
    m.set(c.habit_id, (m.get(c.habit_id) ?? 0) + (c.count as number));
    dailyHabitCount.set(c.date, m);
  }
  for (const [ds, perHabit] of dailyHabitCount) {
    const rec = records.get(ds)!;
    for (const h of habits) {
      const cnt = perHabit.get(h.id) ?? 0;
      if (h.goal_period === 'day' && cnt >= h.goal_value) rec.habitMet.add(h.id);
      // habitDone counts any habit with at least one log that day (matches the
      // legacy "completed" notion the dashboard uses for the completion ring).
      if (cnt >= 1) rec.habitDone += 1;
    }
  }

  for (const s of (sessionsRes.data ?? [])) {
    const r = records.get(s.date);
    if (r) r.workedOut = true;
  }
  for (const s of (setsRes.data ?? [])) {
    const r = records.get(s.date);
    if (r) r.gymVolume += (s.reps ?? 0) * (s.weight ?? 0);
  }

  for (const u of (urgesRes.data ?? [])) {
    const ds = u.created_at.split('T')[0];
    const r = records.get(ds);
    if (r) {
      r.urgeCount += 1;
      r.urgeIntensitySum += (u.intensity as number);
    }
  }

  for (const rl of (relapsesRes.data ?? [])) {
    const ds = rl.created_at.split('T')[0];
    const r = records.get(ds);
    if (r) r.relapsed = true;
  }

  for (const g of (goalsRes.data ?? [])) {
    const r = records.get(g.date);
    if (!r) continue;
    r.goalsTotal += 1;
    if (g.done) r.goalsDone += 1;
  }

  // ---------- Filter to ACTIVE days only ----------
  const all = [...records.values()].sort((a, b) => a.date.localeCompare(b.date));
  const active = all.filter(isActive);
  // If we don't have enough active days even in aggregate, nothing is trustworthy.
  if (active.length < MIN_SAMPLES * 2) return [];

  const candidates: Correlation[] = [];

  // Helper for binary bucket comparisons using Cohen's d.
  function pushBinary(opts: {
    id: string;
    daysA: DailyRecord[];
    daysB: DailyRecord[];
    metric: (r: DailyRecord) => number | null;
    format: (mA: number, mB: number, nA: number, nB: number) => string;
  }) {
    const valsA = opts.daysA.map(opts.metric).filter((v): v is number => v !== null);
    const valsB = opts.daysB.map(opts.metric).filter((v): v is number => v !== null);
    if (valsA.length < MIN_SAMPLES || valsB.length < MIN_SAMPLES) return;
    const mA = mean(valsA);
    const mB = mean(valsB);
    // Demand at least one bucket has nonzero variance — guards against the
    // "phantom 0.0" pattern that was producing fake strong findings.
    if (variance(valsA) === 0 && variance(valsB) === 0) return;
    const d = cohensD(valsA, valsB);
    const strength = strengthFromD(d);
    if (!strength) return;
    candidates.push({
      id: opts.id,
      finding: opts.format(mA, mB, valsA.length, valsB.length),
      strength,
      samples: { a: valsA.length, b: valsB.length },
      confidence: 'high',
    });
  }

  // ---------- 1. Urges on workout vs rest days ----------
  pushBinary({
    id: 'urges-vs-gym',
    daysA: active.filter(r => r.workedOut),
    daysB: active.filter(r => !r.workedOut),
    metric: r => r.urgeCount,
    format: (a, b) => a < b
      ? `You log fewer urges on workout days (avg ${a.toFixed(1)}/day) than on rest days (avg ${b.toFixed(1)}/day).`
      : `You log more urges on workout days (avg ${a.toFixed(1)}/day) than on rest days (avg ${b.toFixed(1)}/day).`,
  });

  // ---------- 2. Habit completion rate vs urge count (continuous, Pearson) ----------
  {
    const usable = active.filter(r => r.habitDue > 0);
    if (usable.length >= MIN_SAMPLES * 2) {
      const xs = usable.map(r => r.habitDone / r.habitDue);
      const ys = usable.map(r => r.urgeCount);
      const r = pearson(xs, ys);
      const strength = strengthFromR(r);
      if (strength) {
        candidates.push({
          id: 'urges-vs-habits-pearson',
          finding: r < 0
            ? `As your daily habit completion rises, urges tend to fall (r = ${r.toFixed(2)} across ${usable.length} active days).`
            : `As your daily habit completion rises, urges tend to rise too (r = ${r.toFixed(2)} across ${usable.length} active days).`,
          strength,
          samples: { a: usable.length, b: usable.length },
          confidence: 'high',
        });
      }
    }
  }

  // ---------- 3. Per-habit individual correlations (daily-period habits only) ----------
  for (const h of habits) {
    if (h.goal_period !== 'day') continue;
    const metDays = active.filter(r => r.habitMet.has(h.id));
    const missedDays = active.filter(r => !r.habitMet.has(h.id) && isDue(h, r.date));
    pushBinary({
      id: `urges-vs-habit-${h.id}`,
      daysA: metDays,
      daysB: missedDays,
      metric: r => r.urgeCount,
      format: (a, b) => a < b
        ? `On days you hit "${h.name}", urges average ${a.toFixed(1)} vs ${b.toFixed(1)} on days you don't.`
        : `On days you hit "${h.name}", urges average ${a.toFixed(1)} vs ${b.toFixed(1)} on days you don't (higher — note this).`,
    });
  }

  // ---------- 4. Urge intensity trend over time ----------
  {
    const urgeDays = active.filter(r => r.urgeCount > 0);
    if (urgeDays.length >= MIN_SAMPLES * 2) {
      const sorted = [...urgeDays].sort((a, b) => a.date.localeCompare(b.date));
      const xs = sorted.map((_, i) => i);
      const ys = sorted.map(r => r.urgeIntensitySum / r.urgeCount);
      const m = slope(xs, ys);
      const firstHalf = ys.slice(0, Math.floor(ys.length / 2));
      const secondHalf = ys.slice(Math.floor(ys.length / 2));
      const firstAvg = mean(firstHalf);
      const secondAvg = mean(secondHalf);
      const change = secondAvg - firstAvg;
      // Need at least ~0.4 intensity change to be worth surfacing.
      if (Math.abs(change) >= 0.4 && urgeDays.length >= 6) {
        const direction = change < 0 ? 'down' : 'up';
        const strength: Correlation['strength'] = Math.abs(change) >= 1 ? 'strong' : Math.abs(change) >= 0.7 ? 'moderate' : 'weak';
        candidates.push({
          id: 'urge-intensity-trend',
          finding: direction === 'down'
            ? `Urge intensity is trending down — earlier avg ${firstAvg.toFixed(1)}/5 vs recent ${secondAvg.toFixed(1)}/5.`
            : `Urge intensity is trending up — earlier avg ${firstAvg.toFixed(1)}/5 vs recent ${secondAvg.toFixed(1)}/5 (worth flagging).`,
          strength,
          samples: { a: firstHalf.length, b: secondHalf.length },
          confidence: 'high',
        });
        // silence linter for unused 'm' (slope was used internally; keeping in case we want the slope/day later)
        void m;
      }
    }
  }

  // ---------- 5. Day-of-week urge clustering ----------
  {
    const urgesByDow = Array(7).fill(0) as number[];
    const activeByDow = Array(7).fill(0) as number[];
    for (const r of active) {
      urgesByDow[r.dow] += r.urgeCount;
      activeByDow[r.dow] += 1;
    }
    const totalUrges = urgesByDow.reduce((s, n) => s + n, 0);
    // Need a meaningful number of urges and balanced day-of-week sampling.
    if (totalUrges >= 8) {
      let peakDow = -1, peakRatio = 0;
      for (let i = 0; i < 7; i++) {
        if (activeByDow[i] < 2) continue;
        // Observed urges per active day on this DOW vs overall avg.
        const obs = urgesByDow[i] / activeByDow[i];
        const overall = totalUrges / active.length;
        if (overall === 0) continue;
        const ratio = obs / overall;
        if (ratio > peakRatio) { peakRatio = ratio; peakDow = i; }
      }
      if (peakDow >= 0 && peakRatio >= 1.6) {
        const strength: Correlation['strength'] = peakRatio >= 2.5 ? 'strong' : peakRatio >= 2 ? 'moderate' : 'weak';
        candidates.push({
          id: 'urges-by-dow',
          finding: `Urges cluster on ${DOW_NAMES[peakDow]} — ${urgesByDow[peakDow]} of ${totalUrges} total this window (${peakRatio.toFixed(1)}× your average day).`,
          strength,
          samples: { a: activeByDow[peakDow], b: active.length - activeByDow[peakDow] },
          confidence: 'high',
        });
      }
    }
  }

  // ---------- 6. Workout next-day effect (lag) ----------
  {
    const sorted = [...active].sort((a, b) => a.date.localeCompare(b.date));
    const dateIndex = new Map(sorted.map((r, i) => [r.date, i]));
    const afterGym: number[] = [];
    const afterRest: number[] = [];
    for (const r of sorted) {
      const nextDateMs = new Date(r.date + 'T12:00:00Z').getTime() + 86400000;
      const nextDate = utcDate(new Date(nextDateMs));
      const idx = dateIndex.get(nextDate);
      if (idx === undefined) continue;
      const nextRec = sorted[idx];
      (r.workedOut ? afterGym : afterRest).push(nextRec.urgeCount);
    }
    if (afterGym.length >= MIN_SAMPLES && afterRest.length >= MIN_SAMPLES) {
      const mA = mean(afterGym);
      const mB = mean(afterRest);
      if (!(variance(afterGym) === 0 && variance(afterRest) === 0)) {
        const d = cohensD(afterGym, afterRest);
        const strength = strengthFromD(d);
        if (strength) {
          candidates.push({
            id: 'urges-day-after-gym',
            finding: mA < mB
              ? `The day after a workout you log fewer urges (avg ${mA.toFixed(1)}) than the day after a rest day (avg ${mB.toFixed(1)}).`
              : `The day after a workout you log more urges (avg ${mA.toFixed(1)}) than the day after a rest day (avg ${mB.toFixed(1)}).`,
            strength,
            samples: { a: afterGym.length, b: afterRest.length },
            confidence: 'high',
          });
        }
      }
    }
  }

  // Sort: strongest first.
  const order = { strong: 0, moderate: 1, weak: 2 };
  return candidates
    .sort((a, b) => order[a.strength] - order[b.strength])
    .slice(0, 5);
}
