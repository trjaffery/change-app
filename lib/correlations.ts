import type { SupabaseClient } from '@supabase/supabase-js';

export interface Correlation {
  id: string;
  finding: string;
  strength: 'strong' | 'moderate' | 'weak';
  samples: { a: number; b: number };
  confidence: 'high' | 'low';
}

interface DailyRecord {
  workedOut: boolean;
  gymVolume: number;
  urgeCount: number;
  relapsed: boolean;
  habitDone: number;
  habitDue: number;
  goalsDone: number;
  goalsTotal: number;
  nwDelta: number | null;
}

const MIN_SAMPLES = 4;
const MIN_EFFECT = 0.25;

// UTC date string, to keep timestamp (created_at) and date-column data on the same axis.
function utcDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function isDue(habit: { schedule_type: string; schedule_days: number[] | null }, dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00Z');
  if (habit.schedule_type === 'specific_days_week') return habit.schedule_days?.includes(d.getUTCDay()) ?? false;
  if (habit.schedule_type === 'specific_days_month') return habit.schedule_days?.includes(d.getUTCDate()) ?? false;
  return true;
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function relDiff(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-9);
}

function strengthOf(effect: number): Correlation['strength'] | null {
  if (effect >= 0.5) return 'strong';
  if (effect >= 0.35) return 'moderate';
  if (effect >= MIN_EFFECT) return 'weak';
  return null;
}

function buildCorrelation(opts: {
  id: string;
  daysA: DailyRecord[];
  daysB: DailyRecord[];
  metric: (r: DailyRecord) => number | null;
  format: (a: number, b: number, nA: number, nB: number) => string;
  confidence?: 'high' | 'low';
}): Correlation | null {
  const valsA = opts.daysA.map(opts.metric).filter((v): v is number => v !== null);
  const valsB = opts.daysB.map(opts.metric).filter((v): v is number => v !== null);
  if (valsA.length < MIN_SAMPLES || valsB.length < MIN_SAMPLES) return null;

  const mA = mean(valsA);
  const mB = mean(valsB);
  const strength = strengthOf(relDiff(mA, mB));
  if (!strength) return null;

  return {
    id: opts.id,
    finding: opts.format(mA, mB, valsA.length, valsB.length),
    strength,
    samples: { a: valsA.length, b: valsB.length },
    confidence: opts.confidence ?? 'high',
  };
}

export async function computeCorrelations(sb: SupabaseClient, windowDays = 30): Promise<Correlation[]> {
  const now = Date.now();
  const startStr = utcDate(new Date(now - (windowDays - 1) * 86400000));
  const startIso = new Date(now - (windowDays - 1) * 86400000).toISOString();

  const [habitsRes, completionsRes, sessionsRes, setsRes, urgesRes, relapsesRes, goalsRes, nwRes] = await Promise.all([
    sb.from('habits').select('id, schedule_type, schedule_days').is('archived_at', null),
    sb.from('habit_completions').select('habit_id, date, count').gte('date', startStr),
    sb.from('gym_sessions').select('date').gte('date', startStr),
    sb.from('gym_sets').select('date, reps, weight').gte('date', startStr),
    sb.from('recovery_urges').select('created_at').gte('created_at', startIso),
    sb.from('recovery_relapses').select('created_at').gte('created_at', startIso),
    sb.from('goals').select('date, done').gte('date', startStr),
    sb.from('finance_nw_history').select('total, snapshot_date').gte('snapshot_date', startStr).order('snapshot_date'),
  ]);

  const habits = habitsRes.data ?? [];

  const records = new Map<string, DailyRecord>();
  for (let i = 0; i < windowDays; i++) {
    const ds = utcDate(new Date(now - i * 86400000));
    records.set(ds, { workedOut: false, gymVolume: 0, urgeCount: 0, relapsed: false, habitDone: 0, habitDue: 0, goalsDone: 0, goalsTotal: 0, nwDelta: null });
  }

  for (const [ds, rec] of records) {
    rec.habitDue = habits.filter((h: { schedule_type: string; schedule_days: number[] | null }) => isDue(h, ds)).length;
  }

  const doneByDay = new Map<string, Set<string>>();
  for (const c of completionsRes.data ?? []) {
    if ((c.count ?? 0) < 1 || !records.has(c.date)) continue;
    if (!doneByDay.has(c.date)) doneByDay.set(c.date, new Set());
    doneByDay.get(c.date)!.add(c.habit_id);
  }
  for (const [ds, set] of doneByDay) {
    const r = records.get(ds);
    if (r) r.habitDone = set.size;
  }

  for (const s of sessionsRes.data ?? []) {
    const r = records.get(s.date);
    if (r) r.workedOut = true;
  }
  for (const s of setsRes.data ?? []) {
    const r = records.get(s.date);
    if (r) r.gymVolume += (s.reps ?? 0) * (s.weight ?? 0);
  }

  for (const u of urgesRes.data ?? []) {
    const r = records.get(u.created_at.split('T')[0]);
    if (r) r.urgeCount += 1;
  }
  for (const rl of relapsesRes.data ?? []) {
    const r = records.get(rl.created_at.split('T')[0]);
    if (r) r.relapsed = true;
  }

  for (const g of goalsRes.data ?? []) {
    const r = records.get(g.date);
    if (!r) continue;
    r.goalsTotal += 1;
    if (g.done) r.goalsDone += 1;
  }

  const nw = nwRes.data ?? [];
  for (let i = 1; i < nw.length; i++) {
    const r = records.get(nw[i].snapshot_date);
    if (r) r.nwDelta = nw[i].total - nw[i - 1].total;
  }

  const all = [...records.values()];
  const gymDays = all.filter(r => r.workedOut);
  const restDays = all.filter(r => !r.workedOut);

  const habitRate = (r: DailyRecord) => (r.habitDue > 0 ? r.habitDone / r.habitDue : null);
  const goalRate = (r: DailyRecord) => (r.goalsTotal > 0 ? r.goalsDone / r.goalsTotal : null);

  const daysWithHabits = all.filter(r => r.habitDue > 0);
  const sortedRates = daysWithHabits.map(r => r.habitDone / r.habitDue).sort((a, b) => a - b);
  const medianRate = sortedRates.length ? sortedRates[Math.floor(sortedRates.length / 2)] : 0;
  const highHabit = daysWithHabits.filter(r => r.habitDone / r.habitDue >= medianRate);
  const lowHabit = daysWithHabits.filter(r => r.habitDone / r.habitDue < medianRate);

  const relapseDays = all.filter(r => r.relapsed);
  const nonRelapseDays = all.filter(r => !r.relapsed);

  const fmtMoney = (n: number) => `${n >= 0 ? '+' : '−'}$${Math.abs(Math.round(n)).toLocaleString()}`;

  const candidates: (Correlation | null)[] = [
    buildCorrelation({
      id: 'urges-vs-gym',
      daysA: gymDays,
      daysB: restDays,
      metric: r => r.urgeCount,
      format: (a, b) => a < b
        ? `You log fewer urges on workout days (avg ${a.toFixed(1)}/day) than on rest days (avg ${b.toFixed(1)}/day).`
        : `You log more urges on workout days (avg ${a.toFixed(1)}/day) than on rest days (avg ${b.toFixed(1)}/day).`,
    }),
    buildCorrelation({
      id: 'urges-vs-habits',
      daysA: highHabit,
      daysB: lowHabit,
      metric: r => r.urgeCount,
      format: (a, b) => a < b
        ? `Urges run lower on days you complete more habits (avg ${a.toFixed(1)}) than on low-habit days (avg ${b.toFixed(1)}).`
        : `Urges run higher on days you complete more habits (avg ${a.toFixed(1)}) than on low-habit days (avg ${b.toFixed(1)}).`,
    }),
    buildCorrelation({
      id: 'habits-vs-relapse',
      daysA: relapseDays,
      daysB: nonRelapseDays,
      metric: habitRate,
      format: (a, b) => `Habit completion on relapse days averaged ${Math.round(a * 100)}%, vs ${Math.round(b * 100)}% on other days.`,
    }),
    buildCorrelation({
      id: 'goals-vs-gym',
      daysA: gymDays,
      daysB: restDays,
      metric: goalRate,
      format: (a, b) => a > b
        ? `You finish more of your daily goals on workout days (${Math.round(a * 100)}%) than on rest days (${Math.round(b * 100)}%).`
        : `You finish fewer of your daily goals on workout days (${Math.round(a * 100)}%) than on rest days (${Math.round(b * 100)}%).`,
    }),
    buildCorrelation({
      id: 'finance-vs-habits',
      daysA: highHabit,
      daysB: lowHabit,
      metric: r => r.nwDelta,
      confidence: 'low',
      format: (a, b) => `Net worth moves ${fmtMoney(a)}/day on high-habit days vs ${fmtMoney(b)}/day on low-habit days.`,
    }),
  ];

  const order = { strong: 0, moderate: 1, weak: 2 };
  return candidates
    .filter((c): c is Correlation => c !== null)
    .sort((a, b) => order[a.strength] - order[b.strength])
    .slice(0, 5);
}
