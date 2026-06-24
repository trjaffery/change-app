'use client';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/layout/Toast';

interface Diag {
  now: string;
  tz: string;
  localTime: string;
  localDate: string;
  env: { vapidPublic: boolean; vapidPrivate: boolean; vapidSubject: boolean; cronSecret: boolean };
  subscriptions: {
    count: number;
    newest: { id: string; created_at: string; last_used_at: string | null; user_agent: string | null } | null;
  };
  prefs: Record<string, unknown>;
  habitReminders: { name: string; reminderTime: string; scheduledToday: boolean; firedToday: boolean }[];
  recentLog: { kind: string; key: string; sent_at: string }[];
  lastLogAgeMin: number | null;
  heartbeat: { iso: string | null; ageMin: number | null };
}

const TEST_KINDS: { kind: string; label: string }[] = [
  { kind: 'digest',       label: 'Digest' },
  { kind: 'habit',        label: 'Habit reminder' },
  { kind: 'workout',      label: 'Workout' },
  { kind: 'sub-renewal',  label: 'Subscription' },
  { kind: 'milestone',    label: 'Milestone' },
  { kind: 'urge',         label: 'Urge check-in' },
  { kind: 'goal-evening', label: 'Goal evening' },
];

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  if (min < 60 * 24) return `${Math.round(min / 60)}h ago`;
  return `${Math.round(min / (60 * 24))}d ago`;
}

export default function DiagnosticsPanel() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [diag, setDiag] = useState<Diag | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/push/diagnostics');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json() as Diag;
      setDiag(d);
    } catch (e) {
      toast({ kind: 'error', message: e instanceof Error ? e.message : 'Diagnostics failed' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { if (open && !diag) load(); }, [open, diag, load]);

  async function sendKind(kind: string) {
    setTesting(kind);
    try {
      const res = await fetch(`/api/push/test/${kind}`, { method: 'POST' });
      const data = await res.json() as { sent?: number; failed?: number; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast({ kind: 'success', message: `Sent ${data.sent} / failed ${data.failed}` });
    } catch (e) {
      toast({ kind: 'error', message: e instanceof Error ? e.message : 'Send failed' });
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <style>{`
        .diag-head { display:flex; align-items:center; justify-content:space-between; cursor:pointer; -webkit-tap-highlight-color: transparent; }
        .diag-chevron { font-family: var(--font-mono); font-size: 14px; color: var(--text-tertiary); transition: transform 200ms ease; }
        .diag-chevron.open { transform: rotate(90deg); }

        .diag-section { margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.05); }
        .diag-section-title { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 8px; }

        .diag-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 4px 0; font-size: 12px; }
        .diag-row .k { color: var(--text-tertiary); font-family: var(--font-mono); font-size: 11px; }
        .diag-row .v { color: var(--text-primary); font-family: var(--font-mono); font-size: 11px; text-align: right; word-break: break-all; }
        .diag-row .v.good { color: var(--success); }
        .diag-row .v.bad { color: var(--danger); }
        .diag-row .v.warn { color: #F2C063; }

        .diag-pill { display:inline-flex; align-items:center; gap:4px; padding: 1px 7px; border-radius: 999px; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.04em; }
        .diag-pill.on   { background: rgba(107,227,164,0.14); color: var(--success); border: 1px solid rgba(107,227,164,0.3); }
        .diag-pill.off  { background: rgba(255,255,255,0.04); color: var(--text-tertiary); border: 1px solid rgba(255,255,255,0.08); }
        .diag-pill.done { background: rgba(107,227,164,0.14); color: var(--success); }
        .diag-pill.pending { background: rgba(242,192,99,0.14); color: #F2C063; }
        .diag-pill.skip { background: rgba(255,255,255,0.04); color: var(--text-tertiary); }

        .diag-log { font-family: var(--font-mono); font-size: 10px; line-height: 1.6; color: var(--text-secondary); }
        .diag-log .empty { color: var(--text-tertiary); font-style: italic; }

        .diag-tests { display: flex; flex-wrap: wrap; gap: 6px; }
        .diag-test-btn {
          padding: 6px 10px; border-radius: 8px;
          background: transparent; border: 1px solid rgba(255,255,255,0.1);
          color: var(--text-secondary); font-family: var(--font-mono); font-size: 10px;
          letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .diag-test-btn:hover { background: rgba(255,255,255,0.04); }
        .diag-test-btn:disabled { opacity: 0.4; cursor: default; }

        .diag-refresh {
          padding: 5px 10px; border-radius: 8px;
          background: transparent; border: 1px solid rgba(255,255,255,0.1);
          color: var(--text-tertiary); font-family: var(--font-mono); font-size: 10px;
          letter-spacing: 0.06em; cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
      `}</style>

      <div className="diag-head" onClick={() => setOpen(o => !o)}>
        <div className="section-title" style={{ margin: 0 }}>Diagnostics</div>
        <span className={`diag-chevron${open ? ' open' : ''}`}>›</span>
      </div>

      {open && (
        <>
          {loading && <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-tertiary)' }}>Loading…</div>}
          {!loading && diag && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button className="diag-refresh" onClick={load}>Refresh</button>
              </div>

              <div className="diag-section">
                <div className="diag-section-title">Environment</div>
                <div className="diag-row"><span className="k">VAPID_PUBLIC_KEY</span><span className={`v ${diag.env.vapidPublic ? 'good' : 'bad'}`}>{diag.env.vapidPublic ? 'set' : 'MISSING'}</span></div>
                <div className="diag-row"><span className="k">VAPID_PRIVATE_KEY</span><span className={`v ${diag.env.vapidPrivate ? 'good' : 'bad'}`}>{diag.env.vapidPrivate ? 'set' : 'MISSING'}</span></div>
                <div className="diag-row"><span className="k">VAPID_SUBJECT</span><span className={`v ${diag.env.vapidSubject ? 'good' : 'bad'}`}>{diag.env.vapidSubject ? 'set' : 'MISSING'}</span></div>
                <div className="diag-row"><span className="k">CRON_SECRET</span><span className={`v ${diag.env.cronSecret ? 'good' : 'bad'}`}>{diag.env.cronSecret ? 'set' : 'MISSING'}</span></div>
              </div>

              <div className="diag-section">
                <div className="diag-section-title">Now</div>
                <div className="diag-row"><span className="k">timezone</span><span className="v">{diag.tz}</span></div>
                <div className="diag-row"><span className="k">local time</span><span className="v">{diag.localTime}</span></div>
                <div className="diag-row"><span className="k">local date</span><span className="v">{diag.localDate}</span></div>
              </div>

              <div className="diag-section">
                <div className="diag-section-title">Cron health</div>
                <div className="diag-row">
                  <span className="k">cron tick</span>
                  {diag.heartbeat.ageMin === null ? (
                    <span className="v bad">never — cron not reaching app</span>
                  ) : (
                    <span className={`v ${diag.heartbeat.ageMin <= 10 ? 'good' : diag.heartbeat.ageMin <= 60 ? 'warn' : 'bad'}`}>
                      {diag.heartbeat.ageMin}m ago
                    </span>
                  )}
                </div>
                {diag.lastLogAgeMin === null ? (
                  <div className="diag-row"><span className="k">last push sent</span><span className="v">none yet</span></div>
                ) : (
                  <div className="diag-row">
                    <span className="k">last push sent</span>
                    <span className={`v ${diag.lastLogAgeMin <= 60 ? 'good' : 'warn'}`}>{diag.lastLogAgeMin}m ago</span>
                  </div>
                )}
                <div className="diag-row" style={{ alignItems: 'flex-start' }}>
                  <span className="k" style={{ flexShrink: 0 }}>recent log</span>
                  <div className="diag-log" style={{ textAlign: 'right' }}>
                    {diag.recentLog.length === 0
                      ? <div className="empty">no notifications dispatched yet</div>
                      : diag.recentLog.slice(0, 8).map((l, i) => (
                          <div key={i}>{timeAgo(l.sent_at)} · {l.kind} · {l.key.slice(0, 32)}</div>
                        ))
                    }
                  </div>
                </div>
              </div>

              <div className="diag-section">
                <div className="diag-section-title">Subscriptions</div>
                <div className="diag-row"><span className="k">count</span><span className={`v ${diag.subscriptions.count === 0 ? 'bad' : 'good'}`}>{diag.subscriptions.count}</span></div>
                {diag.subscriptions.newest && (
                  <>
                    <div className="diag-row"><span className="k">newest</span><span className="v">{timeAgo(diag.subscriptions.newest.created_at)}</span></div>
                    <div className="diag-row"><span className="k">last used</span><span className="v">{diag.subscriptions.newest.last_used_at ? timeAgo(diag.subscriptions.newest.last_used_at) : '—'}</span></div>
                  </>
                )}
              </div>

              <div className="diag-section">
                <div className="diag-section-title">Habit reminders</div>
                {diag.habitReminders.length === 0 ? (
                  <div className="diag-log empty" style={{ fontSize: 11 }}>No habits have a reminder time set yet — open a habit and pick one.</div>
                ) : (
                  diag.habitReminders.map((h, i) => (
                    <div key={i} className="diag-row">
                      <span className="k">{h.name} · {h.reminderTime}</span>
                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        <span className={`diag-pill ${h.scheduledToday ? 'on' : 'skip'}`}>{h.scheduledToday ? 'today' : 'off day'}</span>
                        <span className={`diag-pill ${h.firedToday ? 'done' : 'pending'}`}>{h.firedToday ? 'sent' : 'pending'}</span>
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="diag-section">
                <div className="diag-section-title">Send sample of each kind</div>
                <div className="diag-tests">
                  {TEST_KINDS.map(t => (
                    <button key={t.kind} className="diag-test-btn" disabled={!!testing} onClick={() => sendKind(t.kind)}>
                      {testing === t.kind ? '…' : t.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
