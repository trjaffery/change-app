'use client';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { getActiveDateString } from '@/lib/dates';
import { suggestNext } from '@/lib/gym-progression';
import BottomSheet from '@/components/layout/BottomSheet';
import { useToast } from '@/components/layout/Toast';

interface WorkoutSummary {
  totals: { volume: number; sets: number; exercises: number; duration_minutes: number | null };
  prs: { exercise: string; weight: number; reps: number; previous: number }[];
  volume_delta_pct: number | null;
  prior_avg_volume: number | null;
  note: string | null;
}
interface SplitExercise { id: string; exercise: string; target_sets: number; target_reps: string; default_rest_seconds?: number | null }
interface GymSet { id: string; exercise: string; reps: number; weight: number; parent_set_id?: string | null }
// `uid` is a client-only identity so async completions (save/delete) can find
// their row even after rows above it were deleted. `pending` = optimistic
// save in flight — rendered as logged immediately. `parentUid` points at the
// row this drop set belongs to (null = normal set).
interface SetRow { uid: number; reps: string; weight: string; loggedId: string | null; pending?: boolean; parentUid: number | null }
interface ExerciseBlock {
  exercise: string;
  splitExId: string | null;
  targetSets: number;
  targetReps: string;
  // Phase 4 #14: per-exercise rest override. Null = use session-level restDuration.
  restSeconds: number | null;
  rows: SetRow[];
  aiState: { label: string; response: string; loading: boolean } | null;
  lastSet: { weight: number; reps: number; daysAgo: number } | null;
}

// Heuristic for the default rest when neither the exercise template nor the
// session-level value is set. Compounds need ~3 min; isolations ~75s.
const COMPOUND_RE = /squat|deadlift|bench|row|press|dip|chin|pull-?up|hip thrust|clean|snatch|jerk|lunge/i;
function inferRest(exercise: string): number {
  return COMPOUND_RE.test(exercise) ? 180 : 75;
}

function daysBetween(isoDate: string): number {
  const past = new Date(isoDate + 'T12:00:00').getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - past) / 86400000));
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

let rowUidCounter = 0;
const nextUid = () => ++rowUidCounter;

function makeRows(count: number, defaultWeight: string, defaultReps: string): SetRow[] {
  return Array.from({ length: count }, () => ({ uid: nextUid(), reps: defaultReps, weight: defaultWeight, loggedId: null, parentUid: null }));
}

// Rebuild session rows from persisted sets: top-level sets in logged order,
// each drop set slotted directly after its parent (and the parent's earlier
// drops). Orphaned drops (parent deleted server-side) fall to the end as
// normal rows.
function buildRowsFromSets(sets: GymSet[]): SetRow[] {
  const rows: SetRow[] = [];
  const uidByLoggedId = new Map<string, number>();
  for (const s of sets.filter(x => !x.parent_set_id)) {
    const uid = nextUid();
    uidByLoggedId.set(s.id, uid);
    rows.push({ uid, reps: String(s.reps), weight: String(s.weight), loggedId: s.id, parentUid: null });
  }
  for (const d of sets.filter(x => x.parent_set_id)) {
    const parentUid = uidByLoggedId.get(d.parent_set_id!) ?? null;
    const row: SetRow = { uid: nextUid(), reps: String(d.reps), weight: String(d.weight), loggedId: d.id, parentUid };
    let idx = rows.findIndex(r => r.uid === parentUid);
    if (idx === -1) { rows.push(row); continue; }
    while (idx + 1 < rows.length && rows[idx + 1].parentUid === parentUid) idx++;
    rows.splice(idx + 1, 0, row);
  }
  return rows;
}

// The in-progress workout is mirrored here so the gym page can auto-resume it
// if iOS kills the PWA mid-session. Cleared when the workout is ended.
export const GYM_ACTIVE_WORKOUT_KEY = 'gymActiveWorkout';
export interface ActiveWorkoutRecord {
  sessionId: string;
  date: string;
  splitDayId: string | null;
  dayLabel: string;
  startEpoch: number; // ms epoch the timer is anchored to
}

export interface ResumeInfo { sessionId: string; date: string; baseElapsed: number }

export default function WorkoutSession({
  splitDayId, dayLabel, onFinish, restDuration = 90, resume = null,
}: {
  splitDayId: string | null;
  dayLabel: string;
  onFinish: () => void;
  restDuration?: number;
  resume?: ResumeInfo | null;
}) {
  const toast = useToast();
  const today = getActiveDateString();
  // Resumed workouts keep logging to their original date, not today.
  const sessionDate = resume?.date ?? today;
  const [blocks, setBlocks] = useState<ExerciseBlock[]>([]);
  const [allExercises, setAllExercises] = useState<string[]>([]);
  const [freeEx, setFreeEx] = useState('');
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(resume?.baseElapsed ?? 0);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  // Row uid the rest strip renders under — uid, not indices, so deleting rows
  // above it can't shift the strip onto the wrong set.
  const [restingUid, setRestingUid] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionCreatedRef = useRef(false);
  const elapsedRef = useRef(resume?.baseElapsed ?? 0);
  // Wall-clock anchors — setInterval freezes when the tab is backgrounded or
  // the phone locks, so elapsed/rest are always derived from Date.now()
  // instead of counting ticks. Lazily initialized outside render for purity.
  const startEpochRef = useRef<number | null>(null);
  const restEndsAtRef = useRef<number | null>(null);

  function getStartEpoch(): number {
    if (startEpochRef.current === null) {
      startEpochRef.current = Date.now() - (resume?.baseElapsed ?? 0) * 1000;
    }
    return startEpochRef.current;
  }
  // Finish modal
  const [showFinish, setShowFinish] = useState(false);
  const [finishRpe, setFinishRpe] = useState<number | null>(null);
  const [finishNotes, setFinishNotes] = useState('');
  const [finishing, setFinishing] = useState(false);
  // Post-workout summary sheet
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  function saveActiveRecord(sid: string) {
    try {
      const rec: ActiveWorkoutRecord = { sessionId: sid, date: sessionDate, splitDayId, dayLabel, startEpoch: getStartEpoch() };
      localStorage.setItem(GYM_ACTIVE_WORKOUT_KEY, JSON.stringify(rec));
    } catch { /* storage full/blocked — auto-resume just won't work */ }
  }

  // Create session record once (or attach to the resumed one) — guard prevents
  // StrictMode double-fire
  useEffect(() => {
    if (sessionCreatedRef.current) return;
    sessionCreatedRef.current = true;
    if (resume) {
      sessionIdRef.current = resume.sessionId;
      saveActiveRecord(resume.sessionId);
      return;
    }
    fetch('/api/gym/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ split_day_id: splitDayId, date: sessionDate }),
    }).then(r => r.json()).then(data => {
      sessionIdRef.current = data.id;
      saveActiveRecord(data.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitDayId, sessionDate]);

  function tickElapsed() {
    const secs = Math.max(0, Math.floor((Date.now() - getStartEpoch()) / 1000));
    elapsedRef.current = secs;
    setElapsed(secs);
  }

  function tickRest() {
    const endsAt = restEndsAtRef.current;
    if (endsAt === null) return;
    const remaining = Math.ceil((endsAt - Date.now()) / 1000);
    if (remaining <= 0) {
      if (restTimerRef.current) clearInterval(restTimerRef.current);
      restTimerRef.current = null;
      restEndsAtRef.current = null;
      setRestRemaining(null);
      setRestingUid(null);
    } else {
      setRestRemaining(remaining);
    }
  }

  // Workout timer — separate effect so it restarts cleanly after StrictMode
  // remount. Ticks re-derive from the wall clock, and visibilitychange snaps
  // both timers to the correct value the instant the app comes back.
  useEffect(() => {
    timerRef.current = setInterval(tickElapsed, 1000);
    const onVisible = () => {
      if (document.hidden) return;
      tickElapsed();
      tickRest();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (restTimerRef.current) clearInterval(restTimerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const init = useCallback(async () => {
    setLoading(true);
    const [todaySetsRes, allExRes] = await Promise.all([
      fetch(`/api/gym?date=${sessionDate}`),
      fetch('/api/gym/exercises'),
    ]);
    const todaySets: GymSet[] = await todaySetsRes.json();
    setAllExercises(await allExRes.json());

    if (!splitDayId) {
      const map: Record<string, GymSet[]> = {};
      for (const s of todaySets) { if (!map[s.exercise]) map[s.exercise] = []; map[s.exercise].push(s); }
      setBlocks(Object.entries(map).map(([exercise, sets]) => ({
        exercise, splitExId: null, targetSets: sets.length, targetReps: '', restSeconds: null,
        rows: buildRowsFromSets(sets),
        aiState: null,
        lastSet: null,
      })));
      setLoading(false);
      return;
    }

    const allSplits: { split_days: (SplitExercise & { id: string; split_exercises: SplitExercise[] })[] }[] = await fetch('/api/gym/splits').then(r => r.json());
    let exercises: SplitExercise[] = [];
    for (const sp of allSplits) {
      const day = sp.split_days?.find((d: { id: string }) => d.id === splitDayId);
      if (day) { exercises = (day as unknown as { split_exercises: SplitExercise[] }).split_exercises ?? []; break; }
    }

    const histories = await Promise.all(
      exercises.map(ex => fetch(`/api/gym/history?exercise=${encodeURIComponent(ex.exercise)}`).then(r => r.json()))
    );

    const todayByEx: Record<string, GymSet[]> = {};
    for (const s of todaySets) { if (!todayByEx[s.exercise]) todayByEx[s.exercise] = []; todayByEx[s.exercise].push(s); }

    setBlocks(exercises.map((ex, i) => {
      const hist: { date: string; sets: { reps: number; weight: number }[] }[] = histories[i] ?? [];
      const lastSession = hist.length > 0 ? hist[hist.length - 1] : null;
      const lastWeight = lastSession ? String(lastSession.sets.at(-1)?.weight ?? '') : '';
      // Last-set summary: heaviest set of the previous session, ties broken by reps.
      let lastSet: ExerciseBlock['lastSet'] = null;
      if (lastSession && lastSession.sets.length > 0) {
        const top = lastSession.sets.reduce(
          (best, s) => (s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best),
          lastSession.sets[0],
        );
        lastSet = { weight: top.weight, reps: top.reps, daysAgo: daysBetween(lastSession.date) };
      }
      const logged = todayByEx[ex.exercise] ?? [];
      let rows: SetRow[];
      if (logged.length > 0) {
        rows = buildRowsFromSets(logged);
        // Pad up to the target counting only top-level sets — drops are extras.
        let mainCount = rows.filter(r => r.parentUid === null).length;
        while (mainCount < ex.target_sets) { rows.push({ uid: nextUid(), reps: ex.target_reps.split('-')[0], weight: lastWeight, loggedId: null, parentUid: null }); mainCount++; }
      } else {
        rows = makeRows(ex.target_sets, lastWeight, ex.target_reps.split('-')[0]);
      }
      return { exercise: ex.exercise, splitExId: ex.id, targetSets: ex.target_sets, targetReps: ex.target_reps, restSeconds: ex.default_rest_seconds ?? null, rows, aiState: null, lastSet };
    }));
    setLoading(false);
  }, [splitDayId, sessionDate]);

  useEffect(() => { init(); }, [init]);

  function startRest(block: ExerciseBlock, rowUid: number) {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    setRestingUid(rowUid);
    // Phase 4 #14: per-exercise override wins; otherwise the compound/isolation
    // heuristic; otherwise the session-level fallback.
    const effectiveRest = block.restSeconds ?? inferRest(block.exercise) ?? restDuration;
    // eslint-disable-next-line react-hooks/purity -- event-handler path, not render
    restEndsAtRef.current = Date.now() + effectiveRest * 1000;
    setRestRemaining(effectiveRest);
    restTimerRef.current = setInterval(tickRest, 500);
  }

  function skipRest() {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    restTimerRef.current = null;
    restEndsAtRef.current = null;
    setRestRemaining(null);
    setRestingUid(null);
  }

  async function endWorkout(rpe: number | null, notes: string) {
    setFinishing(true);
    if (timerRef.current) clearInterval(timerRef.current);
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    try { localStorage.removeItem(GYM_ACTIVE_WORKOUT_KEY); } catch {}
    const sid = sessionIdRef.current;
    if (sid) {
      const body: Record<string, unknown> = { ended_at: new Date().toISOString(), duration_seconds: elapsedRef.current };
      if (rpe !== null) body.rpe = rpe;
      const trimmed = notes.trim();
      if (trimmed) body.notes = trimmed;
      await fetch(`/api/gym/sessions/${sid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      // Compute the post-workout summary. Deterministic totals + PRs are cheap;
      // the AI note (optional) lives inside the same response.
      try {
        const sumRes = await fetch('/api/ai/workout-summary', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sid }),
        });
        if (sumRes.ok) {
          const s = await sumRes.json() as WorkoutSummary;
          setSummary(s);
          setShowFinish(false);
          setShowSummary(true);
          setFinishing(false);
          return;
        }
      } catch { /* fall through to onFinish */ }
    }
    onFinish();
  }

  function updateRow(bi: number, ri: number, field: 'reps' | 'weight', value: string) {
    setBlocks(prev => prev.map((b, i) => i !== bi ? b : { ...b, rows: b.rows.map((r, j) => j !== ri ? r : { ...r, [field]: value }) }));
  }

  // Patch a single row wherever it currently lives — safe against rows/blocks
  // shifting while a request was in flight.
  function patchRowByUid(uid: number, patch: Partial<SetRow>) {
    setBlocks(prev => prev.map(b =>
      b.rows.some(r => r.uid === uid)
        ? { ...b, rows: b.rows.map(r => r.uid === uid ? { ...r, ...patch } : r) }
        : b
    ));
  }

  async function logSet(bi: number, ri: number) {
    const block = blocks[bi];
    const row = block.rows[ri];
    if (!row.reps || !row.weight || row.loggedId || row.pending) return;
    // Drop sets need their parent's server id — wait until the parent's
    // optimistic save has confirmed (the check button is disabled until then).
    const parentRow = row.parentUid !== null ? block.rows.find(r => r.uid === row.parentUid) : undefined;
    if (row.parentUid !== null && !parentRow?.loggedId) return;
    // Optimistic: check the box and start resting immediately; reconcile with
    // the server in the background (same pattern as the habits page).
    patchRowByUid(row.uid, { pending: true });
    startRest(block, row.uid);
    try {
      const res = await fetch('/api/gym', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: sessionDate, exercise: block.exercise, reps: Number(row.reps), weight: Number(row.weight),
          split_day_id: splitDayId, parent_set_id: parentRow?.loggedId ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const saved: GymSet = await res.json();
      patchRowByUid(row.uid, { loggedId: saved.id, pending: false });
    } catch {
      patchRowByUid(row.uid, { pending: false });
      skipRest();
      toast({ kind: 'error', message: "Couldn't save set — try again" });
    }
  }

  async function unlogSet(bi: number, ri: number) {
    const row = blocks[bi].rows[ri];
    if (!row.loggedId || row.pending) return;
    const prevId = row.loggedId;
    // Deleting the parent cascades to its drop sets in the DB — mirror that
    // locally so their checkmarks clear too (rows stay, ready to re-log).
    const children = blocks[bi].rows.filter(r => r.parentUid === row.uid && r.loggedId)
      .map(r => ({ uid: r.uid, loggedId: r.loggedId! }));
    patchRowByUid(row.uid, { loggedId: null });
    for (const c of children) patchRowByUid(c.uid, { loggedId: null });
    try {
      const res = await fetch(`/api/gym/${prevId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      patchRowByUid(row.uid, { loggedId: prevId });
      for (const c of children) patchRowByUid(c.uid, { loggedId: c.loggedId });
      toast({ kind: 'error', message: "Couldn't remove set" });
    }
  }

  function addSetRow(bi: number) {
    setBlocks(prev => prev.map((b, i) => i !== bi ? b : {
      ...b, rows: [...b.rows, { uid: nextUid(), reps: b.targetReps.split('-')[0] || '', weight: b.rows.at(-1)?.weight ?? '', loggedId: null, parentUid: null }],
    }));
  }

  // Swipe-left on a set row inserts a drop set directly below it. Weight is
  // prefilled ~20% lighter (nearest 5 lb); swiping a drop row chains another
  // drop onto the same parent.
  function addDropSet(bi: number, ri: number) {
    setBlocks(prev => prev.map((b, i) => {
      if (i !== bi) return b;
      const src = b.rows[ri];
      if (!src) return b;
      const parentUid = src.parentUid ?? src.uid;
      const w = Number(src.weight);
      const dropWeight = Number.isFinite(w) && w > 0 ? String(Math.max(5, Math.round((w * 0.8) / 5) * 5)) : '';
      const rows = [...b.rows];
      rows.splice(ri + 1, 0, { uid: nextUid(), reps: src.reps, weight: dropWeight, loggedId: null, parentUid });
      return { ...b, rows };
    }));
  }

  async function deleteSetRow(bi: number, ri: number) {
    const row = blocks[bi].rows[ri];
    if (row.pending) return;
    // A parent takes its drop rows with it (DB cascade covers the logged ones).
    const doomed = new Set<number>([row.uid, ...blocks[bi].rows.filter(r => r.parentUid === row.uid).map(r => r.uid)]);
    if (restingUid !== null && doomed.has(restingUid)) skipRest();
    setBlocks(prev => prev.map((b, i) => i !== bi ? b : { ...b, rows: b.rows.filter(r => !doomed.has(r.uid)) }));
    if (row.loggedId) {
      try {
        const res = await fetch(`/api/gym/${row.loggedId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        toast({ kind: 'error', message: "Couldn't delete set" });
        init(); // rebuild from server so UI matches reality
      }
    }
  }

  // Removes the exercise from THIS workout only (its logged sets today).
  // Never touches the split template, so the schedule is unchanged.
  async function removeExercise(bi: number) {
    const block = blocks[bi];
    const loggedIds = block.rows.filter(r => r.loggedId).map(r => r.loggedId!);
    if (loggedIds.length > 0 && !confirm(`Remove ${block.exercise} and its ${loggedIds.length} logged set${loggedIds.length === 1 ? '' : 's'} from this workout?`)) return;
    if (block.rows.some(r => r.uid === restingUid)) skipRest();
    setBlocks(prev => prev.filter((_, i) => i !== bi));
    if (loggedIds.length > 0) {
      const results = await Promise.allSettled(loggedIds.map(id => fetch(`/api/gym/${id}`, { method: 'DELETE' })));
      if (results.some(r => r.status === 'rejected' || !r.value.ok)) {
        toast({ kind: 'error', message: "Couldn't remove all sets" });
        init();
      }
    }
  }

  // ── Swipe-left-to-add-drop-set gesture ──────────────────────────────────
  // Pointer-based, kept in a ref so pointermove never re-renders (same
  // approach as the habit rows). Horizontal-left drag past DROP_SWIPE_PX arms
  // the action; release commits it. Vertical movement bails to native scroll.
  const swipeRef = useRef<null | {
    bi: number; ri: number;
    startX: number; startY: number;
    active: boolean; armed: boolean;
    el: HTMLDivElement;
  }>(null);
  const DROP_SWIPE_PX = 64;

  function onSetPointerDown(e: React.PointerEvent<HTMLDivElement>, bi: number, ri: number) {
    // Don't hijack taps/typing on the row's inputs and buttons.
    if ((e.target as HTMLElement).closest('input, button')) return;
    swipeRef.current = { bi, ri, startX: e.clientX, startY: e.clientY, active: false, armed: false, el: e.currentTarget };
  }

  function onSetPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const s = swipeRef.current;
    if (!s) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (!s.active) {
      if (dx < -10 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        s.active = true;
        s.el.setPointerCapture(e.pointerId);
        s.el.classList.add('swiping');
      } else if (Math.abs(dy) > 14 || dx > 14) {
        swipeRef.current = null;
        return;
      } else {
        return;
      }
    }
    const offset = Math.max(-110, Math.min(0, dx));
    s.el.style.transform = `translateX(${offset}px)`;
    const armed = offset <= -DROP_SWIPE_PX;
    if (armed !== s.armed) {
      s.armed = armed;
      s.el.classList.toggle('drop-armed', armed);
      if (armed && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate(10); } catch { /* not all browsers honour vibrate */ }
      }
    }
  }

  function onSetPointerUp() {
    const s = swipeRef.current;
    if (!s) return;
    s.el.style.transform = '';
    s.el.classList.remove('swiping', 'drop-armed');
    if (s.armed) addDropSet(s.bi, s.ri);
    swipeRef.current = null;
  }

  async function addFreeExercise() {
    if (!freeEx.trim()) return;
    setBlocks(prev => [...prev, { exercise: freeEx.trim(), splitExId: null, targetSets: 3, targetReps: '', restSeconds: null, rows: makeRows(3, '', ''), aiState: null, lastSet: null }]);
    setFreeEx('');
  }

  // Phase 4 #14: cycle the per-exercise rest override through a small preset
  // ladder. Tapping at the heuristic default starts at 60s; tapping past 240s
  // clears the override back to "use heuristic."
  const REST_PRESETS = [60, 90, 120, 180, 240];
  async function cycleRest(bi: number) {
    const block = blocks[bi];
    let next: number | null;
    if (block.restSeconds === null) next = REST_PRESETS[0];
    else {
      const idx = REST_PRESETS.indexOf(block.restSeconds);
      if (idx === -1) next = REST_PRESETS[0];
      else if (idx === REST_PRESETS.length - 1) next = null;
      else next = REST_PRESETS[idx + 1];
    }
    setBlocks(prev => prev.map((b, i) => i !== bi ? b : { ...b, restSeconds: next }));
    // Persist on the template if this block came from one. Free exercises live
    // only in this session — no row to persist to.
    if (block.splitExId) {
      try {
        await fetch(`/api/gym/split-exercises/${block.splitExId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ default_rest_seconds: next }),
        });
      } catch {
        toast({ kind: 'error', message: "Couldn't save rest preference" });
      }
    }
  }

  async function suggestAI(bi: number) {
    const block = blocks[bi];
    setBlocks(prev => prev.map((b, i) => i !== bi ? b : { ...b, aiState: { label: '', response: '', loading: true } }));
    const hist: { date: string; sets: { reps: number; weight: number }[]; rpe?: number | null }[] = await fetch(`/api/gym/history?exercise=${encodeURIComponent(block.exercise)}`).then(r => r.json());
    const sessions = hist.slice(-3);
    if (!sessions.length) {
      setBlocks(prev => prev.map((b, i) => i !== bi ? b : { ...b, aiState: { label: '', response: 'No history yet.', loading: false } }));
      return;
    }
    const lastRpe = sessions[sessions.length - 1]?.rpe ?? null;
    const data = suggestNext(block.exercise, sessions, block.targetSets, block.targetReps, lastRpe);
    setBlocks(prev => prev.map((b, i) => i !== bi ? b : {
      ...b,
      aiState: data
        ? { label: `${data.sets} × ${data.reps} @ ${data.weight} lbs`, response: data.notes, loading: false }
        : { label: '', response: 'No history yet.', loading: false },
    }));
  }

  const doneCount = blocks.reduce((n, b) => n + b.rows.filter(r => r.loggedId || r.pending).length, 0);

  if (loading) return <div style={{ minHeight: 200 }} />;

  return (
    <>
      <style>{`
        /* ─────────────────────────────────────────────────────────────────
           Workout session — "printout" aesthetic.
           Mono numbers dominate; labels are tiny uppercase mono; each section
           is a flat strip separated by thin rules. Rows are 38px tall.
           ───────────────────────────────────────────────────────────────── */

        /* Sticky timer bar — slim, glass, accessible from anywhere on the page */
        .ws-timer {
          position: sticky;
          top: calc(env(safe-area-inset-top) + 8px);
          z-index: 20;
          display: grid;
          grid-template-columns: 1fr auto auto;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          margin-bottom: 18px;
          border-radius: 14px;
          background: rgba(8,8,10,0.82);
          border: 1px solid rgba(107,227,164,0.22);
          backdrop-filter: blur(22px) saturate(1.3);
          -webkit-backdrop-filter: blur(22px) saturate(1.3);
          box-shadow: 0 10px 28px rgba(0,0,0,0.42);
        }
        .ws-timer-meta { min-width: 0; }
        .ws-timer-day {
          font-size: 12px; font-weight: 600; color: var(--text-secondary);
          letter-spacing: -0.005em;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ws-timer-progress {
          font-family: var(--font-mono);
          font-size: 9.5px; color: var(--text-tertiary);
          letter-spacing: 0.08em; text-transform: uppercase;
          margin-top: 2px;
        }
        .ws-timer-clock {
          font-family: var(--font-mono);
          font-size: 28px; font-weight: 700; letter-spacing: -0.04em;
          color: var(--success); font-variant-numeric: tabular-nums;
          line-height: 1;
        }
        .ws-timer-end {
          padding: 9px 16px;
          font-family: var(--font-mono);
          font-size: 11px; font-weight: 700;
          letter-spacing: 0.14em; text-transform: uppercase;
          border-radius: 10px;
          border: 1px solid rgba(255,107,107,0.32);
          background: rgba(255,107,107,0.08);
          color: var(--danger);
          cursor: pointer;
          min-height: 38px;
          transition: background 160ms ease;
          -webkit-tap-highlight-color: transparent;
        }
        .ws-timer-end:active { transform: scale(0.97); }

        /* Top-level progress dots — one per planned set */
        .ws-dots {
          display: flex; gap: 4px; flex-wrap: wrap;
          margin: -8px 2px 18px;
          padding: 0 2px;
        }
        .ws-dot {
          flex: 1 1 0; height: 3px; min-width: 14px;
          border-radius: 999px;
          background: rgba(255,255,255,0.08);
          transition: background 240ms ease, box-shadow 240ms ease;
        }
        .ws-dot.done {
          background: var(--success);
          box-shadow: 0 0 8px rgba(107,227,164,0.55);
        }

        /* ─── EXERCISE SECTION ───────────────────────────────────────── */
        .ws-section {
          margin-bottom: 18px;
        }
        .ws-section + .ws-section {
          padding-top: 18px;
          border-top: 1px solid rgba(255,255,255,0.05);
        }

        .ws-section-head {
          display: flex; align-items: baseline; gap: 8px;
          margin-bottom: 8px;
        }
        .ws-section-num {
          font-family: var(--font-mono);
          font-size: 10px; font-weight: 600;
          color: var(--text-tertiary);
          letter-spacing: 0.04em;
          flex-shrink: 0;
        }
        .ws-section-name {
          font-family: var(--font-mono);
          font-size: 13px; font-weight: 700;
          color: var(--text-primary);
          letter-spacing: 0.04em;
          text-transform: uppercase;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ws-section-target {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--text-tertiary);
          letter-spacing: 0.05em;
          flex-shrink: 0;
        }
        .ws-section-last {
          font-family: var(--font-mono);
          font-size: 10px;
          color: rgba(107,227,164,0.78);
          letter-spacing: 0.02em;
          margin-left: auto;
          flex-shrink: 0;
        }
        .ws-section-ai {
          width: 28px; height: 28px;
          padding: 0;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.08);
          background: transparent;
          color: var(--text-tertiary);
          font-size: 14px; line-height: 1;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 160ms ease, color 160ms ease;
          -webkit-tap-highlight-color: transparent;
        }
        .ws-section-ai:hover, .ws-section-ai:focus-visible {
          background: rgba(255,255,255,0.05);
          color: var(--text-primary);
        }
        .ws-section-ai:active { transform: scale(0.96); }

        /* ─── SET ROW ─────────────────────────────────────────────────── */
        .ws-set {
          display: grid;
          grid-template-columns: 22px 1fr 12px 1fr 22px 38px 26px;
          align-items: center;
          gap: 8px;
          height: 42px;
          padding: 0 8px;
          border-radius: 10px;
          position: relative;
          /* Swipe-left-to-drop-set: keep vertical scroll native, animate the
             snap-back when the finger lifts. */
          touch-action: pan-y;
          transition: transform 200ms cubic-bezier(0.22,1,0.36,1);
        }
        .ws-set.swiping { transition: none; }
        .ws-set + .ws-set { margin-top: 2px; }

        /* "＋ DROP" hint parked just past the row's right edge — it rides
           along as the row translates left, sliding into view. Hidden unless
           a swipe is in progress so it can't cause horizontal overflow. */
        .ws-set::after {
          content: '＋ DROP';
          position: absolute;
          left: calc(100% + 10px);
          top: 50%;
          transform: translateY(-50%);
          font-family: var(--font-mono);
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.14em;
          color: #F2C063;
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid rgba(242,192,99,0.25);
          background: rgba(242,192,99,0.08);
          white-space: nowrap;
          pointer-events: none;
          display: none;
          opacity: 0.5;
        }
        .ws-set.swiping::after { display: block; }
        .ws-set.drop-armed::after {
          opacity: 1;
          background: rgba(242,192,99,0.2);
          border-color: rgba(242,192,99,0.5);
        }

        /* Drop set rows — indented under their parent, amber ↳ marker */
        .ws-set.drop { margin-left: 28px; background: rgba(242,192,99,0.04); }
        .ws-set.drop .ws-set-idx { color: #F2C063; font-size: 13px; }
        .ws-set.active {
          background: rgba(107,227,164,0.05);
        }
        .ws-set.active::before {
          content: '';
          position: absolute; left: -2px; top: 8px; bottom: 8px;
          width: 2px; border-radius: 2px;
          background: var(--success);
          box-shadow: 0 0 8px rgba(107,227,164,0.55);
        }
        .ws-set.logged { opacity: 0.72; }

        .ws-set-idx {
          font-family: var(--font-mono);
          font-size: 10px; font-weight: 600;
          color: var(--text-tertiary);
          letter-spacing: 0.04em;
          text-align: center;
        }
        .ws-set-num {
          font-family: var(--font-mono);
          font-size: 19px; font-weight: 700;
          font-variant-numeric: tabular-nums;
          color: var(--text-primary);
          letter-spacing: -0.02em;
          text-align: right;
          line-height: 1;
        }
        .ws-set.logged .ws-set-num { color: var(--success); }
        .ws-set-x {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--text-tertiary);
          text-align: center;
        }
        .ws-set-input {
          font-family: var(--font-mono);
          font-size: 19px; font-weight: 700;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.02em;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary);
          padding: 0;
          text-align: right;
          width: 100%;
          min-width: 0;
        }
        .ws-set-input::placeholder { color: rgba(255,255,255,0.18); font-weight: 600; }
        /* Hide native number-input spinners */
        .ws-set-input::-webkit-outer-spin-button,
        .ws-set-input::-webkit-inner-spin-button {
          -webkit-appearance: none; margin: 0;
        }
        .ws-set-input[type="number"] { -moz-appearance: textfield; appearance: textfield; }
        .ws-set-unit {
          font-family: var(--font-mono);
          font-size: 9px;
          color: var(--text-tertiary);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          text-align: left;
        }
        .ws-set-check {
          width: 30px; height: 30px;
          border-radius: 8px;
          border: 1px solid rgba(107,227,164,0.32);
          background: transparent;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: background 140ms ease, border-color 140ms ease, transform 100ms ease;
          -webkit-tap-highlight-color: transparent;
          padding: 0;
          /* Ensure 44pt touch target via larger hit area */
          margin: 7px 4px;
        }
        .ws-set-check.done {
          background: rgba(107,227,164,0.18);
          border-color: var(--success);
        }
        .ws-set-check:disabled { opacity: 0.28; cursor: default; }
        .ws-set-check:not(:disabled):active { transform: scale(0.92); }

        .ws-set-del {
          width: 26px; height: 30px;
          padding: 0;
          background: transparent;
          border: none;
          color: var(--text-tertiary);
          font-size: 15px; line-height: 1;
          cursor: pointer;
          opacity: 0.55;
          transition: color 140ms ease, opacity 140ms ease;
          -webkit-tap-highlight-color: transparent;
        }
        .ws-set-del:hover, .ws-set-del:focus-visible { color: var(--danger); opacity: 1; }
        .ws-set-del:active { transform: scale(0.9); }

        /* Slim rest-timer strip below the row that triggered it */
        .ws-rest {
          display: grid;
          grid-template-columns: 1fr auto auto;
          align-items: center;
          gap: 12px;
          height: 30px;
          padding: 0 10px;
          margin: 4px 0 2px;
          border-radius: 8px;
          background: rgba(242,192,99,0.07);
          border: 1px solid rgba(242,192,99,0.22);
        }
        .ws-rest-label {
          font-family: var(--font-mono);
          font-size: 9px; font-weight: 700;
          color: #F2C063;
          letter-spacing: 0.18em; text-transform: uppercase;
        }
        .ws-rest-time {
          font-family: var(--font-mono);
          font-size: 14px; font-weight: 700;
          color: #F2C063;
          letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums;
        }
        .ws-rest-skip {
          background: transparent;
          border: none;
          color: rgba(242,192,99,0.8);
          font-family: var(--font-mono); font-size: 10px;
          letter-spacing: 0.12em; text-transform: uppercase;
          cursor: pointer; padding: 4px 8px; border-radius: 4px;
          -webkit-tap-highlight-color: transparent;
        }

        .ws-add-set {
          margin-top: 6px;
          padding: 6px 10px;
          background: transparent;
          border: none;
          color: var(--text-tertiary);
          font-family: var(--font-mono);
          font-size: 10px; font-weight: 600;
          letter-spacing: 0.16em; text-transform: uppercase;
          cursor: pointer;
          transition: color 140ms ease;
          -webkit-tap-highlight-color: transparent;
        }
        .ws-add-set:hover { color: var(--text-secondary); }

        .ws-ai {
          margin-top: 8px; padding: 10px 12px;
          border-radius: 10px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          font-size: 12px; line-height: 1.55; color: var(--text-secondary);
        }
        .ws-ai strong {
          display: block;
          font-family: var(--font-mono); font-size: 11px;
          letter-spacing: 0.06em;
          color: var(--success);
          margin-bottom: 4px;
        }

        /* Add freeform exercise at bottom — tiny, unobtrusive */
        .ws-add-ex {
          display: flex; align-items: center; gap: 6px;
          margin-top: 22px; padding: 8px 10px;
          border: 1px dashed rgba(255,255,255,0.10);
          border-radius: 10px;
          background: transparent;
        }
        .ws-add-ex input {
          flex: 1; min-width: 0;
          background: transparent; border: none; outline: none;
          font-family: var(--font-sans); font-size: 14px;
          color: var(--text-primary);
          padding: 4px 2px;
          min-height: 32px;
        }
        .ws-add-ex input::placeholder { color: var(--text-tertiary); }
        .ws-add-ex button {
          background: transparent; border: none;
          color: var(--text-tertiary);
          font-family: var(--font-mono); font-size: 16px; font-weight: 600;
          padding: 4px 10px; cursor: pointer;
          min-height: 32px;
          -webkit-tap-highlight-color: transparent;
        }

        @media (max-width: 640px) {
          .ws-timer-clock { font-size: 24px; }
          .ws-set { height: 40px; }
        }
      `}</style>

      {/* Sticky timer bar */}
      <div className="ws-timer">
        <div className="ws-timer-meta">
          <div className="ws-timer-day">{dayLabel || 'Free workout'}</div>
          <div className="ws-timer-progress">
            {doneCount} / {blocks.reduce((n, b) => n + b.rows.length, 0)} sets
          </div>
        </div>
        <div className="ws-timer-clock">{formatTime(elapsed)}</div>
        <button className="ws-timer-end" onClick={() => setShowFinish(true)}>End</button>
      </div>

      {/* Progress dots — one per planned set, top of session view */}
      {blocks.length > 0 && (
        <div className="ws-dots" aria-hidden>
          {blocks.flatMap((b, bi) =>
            b.rows.map((r, ri) => (
              <span key={`${bi}-${ri}`} className={`ws-dot${(r.loggedId || r.pending) ? ' done' : ''}`} />
            ))
          )}
        </div>
      )}

      <BottomSheet
        open={showFinish}
        onClose={() => !finishing && setShowFinish(false)}
        title="How did it feel?"
        disableBackdropClose={finishing}
      >
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          RPE and notes are optional — skip if you don&apos;t track them.
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>RPE</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
            const isSel = finishRpe === n;
            const tone = n <= 4 ? '#6BE3A4' : n <= 7 ? '#F2C063' : '#FF6B6B';
            return (
              <button
                key={n}
                onClick={() => setFinishRpe(isSel ? null : n)}
                style={{
                  flex: '1 1 0', minWidth: 32, height: 40, borderRadius: 10,
                  background: isSel ? `${tone}26` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isSel ? `${tone}88` : 'rgba(255,255,255,0.08)'}`,
                  color: isSel ? tone : 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {n}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>Notes</div>
        <textarea
          value={finishNotes}
          onChange={e => setFinishNotes(e.target.value)}
          placeholder="Energy, form, pain, anything to remember…"
          rows={3}
          style={{ width: '100%', resize: 'vertical', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px', color: 'var(--text-primary)', fontSize: 16, fontFamily: 'var(--font-sans)', outline: 'none', marginBottom: 18 }}
        />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" style={{ fontSize: 13 }} disabled={finishing} onClick={() => endWorkout(null, '')}>Skip & end</button>
          <button className="btn-primary" style={{ fontSize: 13 }} disabled={finishing} onClick={() => endWorkout(finishRpe, finishNotes)}>
            {finishing ? 'Saving…' : 'Save & finish'}
          </button>
        </div>
      </BottomSheet>

      {/* Post-workout summary — deterministic totals + optional AI calibration note */}
      <BottomSheet
        open={showSummary}
        onClose={() => { setShowSummary(false); onFinish(); }}
        title="Session done"
      >
        {summary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <SummaryStat label="Volume" value={`${summary.totals.volume.toLocaleString()}`} unit="lb-reps" />
              <SummaryStat label="Sets" value={`${summary.totals.sets}`} unit={`${summary.totals.exercises} ex`} />
              <SummaryStat label="Duration" value={summary.totals.duration_minutes !== null ? `${summary.totals.duration_minutes}` : '—'} unit="min" />
            </div>

            {summary.volume_delta_pct !== null && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>
                {summary.volume_delta_pct >= 0 ? '+' : ''}{summary.volume_delta_pct.toFixed(0)}% vs your last 3 of this day
              </div>
            )}

            {summary.prs.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--success)', marginBottom: 8 }}>New PRs</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {summary.prs.map((p, i) => (
                    <span key={i} style={{ fontSize: 12, padding: '5px 10px', borderRadius: 14, background: 'rgba(107,227,164,0.1)', border: '1px solid rgba(107,227,164,0.25)', color: 'var(--success)' }}>
                      {p.exercise} {p.weight} lb (prev {p.previous})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {summary.note && (
              <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', borderLeft: '2px solid var(--success)', fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                {summary.note}
              </div>
            )}

            <button className="btn-primary" style={{ width: '100%', fontSize: 14, padding: '12px 18px' }} onClick={() => { setShowSummary(false); onFinish(); }}>Done</button>
          </div>
        )}
      </BottomSheet>

      {/* Exercise sections — flat, dense, mono-driven */}
      {blocks.map((block, bi) => {
        // Index of the first un-logged row in this block; that's the "active" set.
        const activeIdx = block.rows.findIndex(r => !r.loggedId && !r.pending);
        const lastTone = block.lastSet?.daysAgo === 0 ? 'today'
          : block.lastSet?.daysAgo === 1 ? 'yest'
          : `${block.lastSet?.daysAgo}d`;
        return (
          <section key={`${block.exercise}-${bi}`} className="ws-section">
            <header className="ws-section-head">
              <span className="ws-section-num">{String(bi + 1).padStart(2, '0')}</span>
              <span className="ws-section-name">{block.exercise}</span>
              {block.targetReps && (
                <span className="ws-section-target">· {block.targetSets}×{block.targetReps}</span>
              )}
              {block.lastSet && (
                <span className="ws-section-last">
                  ↘ {block.lastSet.weight}×{block.lastSet.reps} · {lastTone}
                </span>
              )}
              <button
                onClick={() => cycleRest(bi)}
                title="Tap to change rest"
                style={{
                  marginLeft: 4, padding: '2px 8px', borderRadius: 999,
                  background: 'transparent',
                  border: `1px solid ${block.restSeconds !== null ? 'rgba(120,180,255,0.32)' : 'rgba(255,255,255,0.10)'}`,
                  color: block.restSeconds !== null ? '#78B4FF' : 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em',
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                }}
              >
                rest {(block.restSeconds ?? inferRest(block.exercise))}s
              </button>
              <button
                className="ws-section-ai"
                disabled={block.aiState?.loading}
                onClick={() => suggestAI(bi)}
                aria-label="AI suggest"
                title="AI suggestion"
              >
                {block.aiState?.loading ? '…' : '✦'}
              </button>
              <button
                className="ws-section-ai"
                onClick={() => removeExercise(bi)}
                aria-label="Remove exercise from this workout"
                title="Remove exercise from this workout"
              >
                ×
              </button>
            </header>

            {block.rows.map((row, ri) => {
              const logged = !!row.loggedId || !!row.pending;
              const isActive = !logged && ri === activeIdx;
              const isDrop = row.parentUid !== null;
              // Drop sets can only be logged once the parent's save confirmed
              // (needs its server id) — a sub-second wait in practice.
              const parentLogged = !isDrop || !!block.rows.find(r => r.uid === row.parentUid)?.loggedId;
              const canLog = !logged && !!row.reps && !!row.weight && parentLogged;
              // Number only top-level sets; drops show the ↳ marker instead.
              const mainIdx = block.rows.slice(0, ri + 1).filter(r => r.parentUid === null).length;
              return (
                <Fragment key={row.uid}>
                  <div
                    className={`ws-set${logged ? ' logged' : isActive ? ' active' : ''}${isDrop ? ' drop' : ''}`}
                    onPointerDown={e => onSetPointerDown(e, bi, ri)}
                    onPointerMove={onSetPointerMove}
                    onPointerUp={onSetPointerUp}
                    onPointerCancel={onSetPointerUp}
                  >
                    <span className="ws-set-idx">{isDrop ? '↳' : String(mainIdx).padStart(2, '0')}</span>
                    {logged ? (
                      <span className="ws-set-num">{row.reps}</span>
                    ) : (
                      <input
                        className="ws-set-input"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        placeholder="—"
                        value={row.reps}
                        onFocus={e => e.currentTarget.select()}
                        onChange={e => updateRow(bi, ri, 'reps', e.target.value)}
                      />
                    )}
                    <span className="ws-set-x">×</span>
                    {logged ? (
                      <span className="ws-set-num">{row.weight}</span>
                    ) : (
                      <input
                        className="ws-set-input"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.5}
                        placeholder="—"
                        value={row.weight}
                        onFocus={e => e.currentTarget.select()}
                        onChange={e => updateRow(bi, ri, 'weight', e.target.value)}
                      />
                    )}
                    <span className="ws-set-unit">lb</span>
                    <button
                      className={`ws-set-check${logged ? ' done' : ''}`}
                      disabled={!logged && !canLog}
                      onClick={() => logged ? unlogSet(bi, ri) : logSet(bi, ri)}
                      aria-label={logged ? 'Un-log set' : 'Log set'}
                    >
                      {logged && (
                        <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
                          <path d="M2 6.5L5.2 9.5L11 3.5" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    <button
                      className="ws-set-del"
                      onClick={() => deleteSetRow(bi, ri)}
                      aria-label="Delete set"
                      title="Delete set"
                    >
                      ×
                    </button>
                  </div>

                  {restingUid === row.uid && restRemaining !== null && (
                    <div className="ws-rest">
                      <span className="ws-rest-label">Rest</span>
                      <span className="ws-rest-time">{formatTime(restRemaining)}</span>
                      <button className="ws-rest-skip" onClick={skipRest}>Skip</button>
                    </div>
                  )}
                </Fragment>
              );
            })}

            <button className="ws-add-set" onClick={() => addSetRow(bi)}>
              + Add set
            </button>

            {block.aiState && !block.aiState.loading && (
              <div className="ws-ai">
                {block.aiState.label && <strong>{block.aiState.label}</strong>}
                {block.aiState.response}
              </div>
            )}
          </section>
        );
      })}

      <div className="ws-add-ex">
        <input
          list="ws-ex-suggestions"
          placeholder="Add exercise"
          value={freeEx}
          onChange={e => setFreeEx(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addFreeExercise()}
          autoCapitalize="words"
        />
        <datalist id="ws-ex-suggestions">{allExercises.map(e => <option key={e} value={e} />)}</datalist>
        <button onClick={addFreeExercise} aria-label="Add exercise">+</button>
      </div>
    </>
  );
}

function SummaryStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div style={{ padding: '12px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-tertiary)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-tertiary)', marginTop: 4, letterSpacing: '0.08em' }}>{unit}</div>
    </div>
  );
}
