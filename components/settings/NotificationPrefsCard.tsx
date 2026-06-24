'use client';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/layout/Toast';

interface Prefs {
  timezone: string;
  digest_enabled: boolean;
  digest_time: string;             // 'HH:MM' or 'HH:MM:SS'
  habit_reminders_enabled: boolean;
  workout_reminder_enabled: boolean;
  workout_reminder_time: string;
  subscription_warnings_enabled: boolean;
  streak_milestones_enabled: boolean;
  urge_checkins_enabled: boolean;
  urge_checkin_hours: number[];
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  goal_evening_enabled: boolean;
  goal_evening_time: string;
}

const DEFAULTS: Prefs = {
  timezone: 'America/Chicago',
  digest_enabled: true,
  digest_time: '07:00',
  habit_reminders_enabled: true,
  workout_reminder_enabled: true,
  workout_reminder_time: '17:00',
  subscription_warnings_enabled: true,
  streak_milestones_enabled: true,
  urge_checkins_enabled: false,
  urge_checkin_hours: [22, 23],
  quiet_hours_start: null,
  quiet_hours_end: null,
  goal_evening_enabled: true,
  goal_evening_time: '20:00',
};

// DB returns 'HH:MM:SS'; <input type="time"> wants 'HH:MM'.
const toInput = (t: string | null | undefined) => (t ?? '').slice(0, 5);

export default function NotificationPrefsCard() {
  const toast = useToast();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/notification-prefs');
        const data = await res.json();
        if (data && typeof data === 'object' && data.timezone) {
          setPrefs({
            ...DEFAULTS,
            ...data,
            digest_time: toInput(data.digest_time),
            workout_reminder_time: toInput(data.workout_reminder_time),
            goal_evening_time: toInput(data.goal_evening_time) || '20:00',
            quiet_hours_start: data.quiet_hours_start ? toInput(data.quiet_hours_start) : null,
            quiet_hours_end: data.quiet_hours_end ? toInput(data.quiet_hours_end) : null,
          });
        }
      } finally { setLoading(false); }
    })();
  }, []);

  async function save(patch: Partial<Prefs>) {
    setSaving(true);
    const next = { ...prefs, ...patch };
    setPrefs(next);                       // optimistic
    try {
      const res = await fetch('/api/notification-prefs', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      toast({ kind: 'error', message: e instanceof Error ? e.message : 'Save failed' });
    } finally { setSaving(false); }
  }

  if (loading) return null;

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <style>{`
        .np-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .np-row:last-child { border-bottom: none; }
        .np-title { font-size: 14px; color: var(--text-primary); font-weight: 500; }
        .np-desc  { font-size: 11px; color: var(--text-tertiary); font-family: var(--font-mono); margin-top: 3px; letter-spacing: 0.02em; }
        .np-toggle { width: 40px; height: 22px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.06); position: relative; cursor: pointer; flex-shrink: 0; transition: background 160ms; -webkit-tap-highlight-color: transparent; }
        .np-toggle.on { background: rgba(107,227,164,0.3); border-color: rgba(107,227,164,0.5); }
        .np-toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--text-primary); transition: transform 160ms; }
        .np-toggle.on::after { transform: translateX(18px); background: var(--success); }
        .np-time { width: 110px; padding: 6px 10px; border-radius: 8px; background: rgba(0,0,0,0.22); border: 1px solid rgba(255,255,255,0.08); color: var(--text-primary); font-family: var(--font-mono); font-size: 12px; }
        .np-inline-time { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; }
      `}</style>

      <div className="section-title">Notification preferences</div>

      <Row title="Daily digest" desc="One push each morning summarizing today">
        <Toggle on={prefs.digest_enabled} onChange={v => save({ digest_enabled: v })} />
      </Row>
      {prefs.digest_enabled && (
        <div className="np-inline-time">
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>at</span>
          <input type="time" className="np-time" value={prefs.digest_time}
                 onChange={e => save({ digest_time: e.target.value })} />
        </div>
      )}

      <Row title="Per-habit reminders" desc="Push at each habit's reminder time (set on the habit)">
        <Toggle on={prefs.habit_reminders_enabled} onChange={v => save({ habit_reminders_enabled: v })} />
      </Row>

      <Row title="Workout reminder" desc="Push on scheduled split days if not logged">
        <Toggle on={prefs.workout_reminder_enabled} onChange={v => save({ workout_reminder_enabled: v })} />
      </Row>
      {prefs.workout_reminder_enabled && (
        <div className="np-inline-time">
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>at</span>
          <input type="time" className="np-time" value={prefs.workout_reminder_time}
                 onChange={e => save({ workout_reminder_time: e.target.value })} />
        </div>
      )}

      <Row title="Evening goal check-in" desc="If any of today's goals are still unchecked">
        <Toggle on={prefs.goal_evening_enabled} onChange={v => save({ goal_evening_enabled: v })} />
      </Row>
      {prefs.goal_evening_enabled && (
        <div className="np-inline-time">
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>at</span>
          <input type="time" className="np-time" value={prefs.goal_evening_time}
                 onChange={e => save({ goal_evening_time: e.target.value })} />
        </div>
      )}

      <Row title="Subscription renewals" desc="Heads-up the day before a sub renews">
        <Toggle on={prefs.subscription_warnings_enabled} onChange={v => save({ subscription_warnings_enabled: v })} />
      </Row>

      <Row title="Streak milestones" desc="7 / 30 / 90 / 180 / 365 days clean">
        <Toggle on={prefs.streak_milestones_enabled} onChange={v => save({ streak_milestones_enabled: v })} />
      </Row>

      <Row title="Urge check-ins" desc="Quiet nudge in known hot windows (default 10–11pm)">
        <Toggle on={prefs.urge_checkins_enabled} onChange={v => save({ urge_checkins_enabled: v })} />
      </Row>

      <Row title="Quiet hours" desc="Suppress all notifications in this window">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="time" className="np-time" style={{ width: 92 }}
                 value={prefs.quiet_hours_start ?? ''}
                 onChange={e => save({ quiet_hours_start: e.target.value || null })} />
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>–</span>
          <input type="time" className="np-time" style={{ width: 92 }}
                 value={prefs.quiet_hours_end ?? ''}
                 onChange={e => save({ quiet_hours_end: e.target.value || null })} />
        </div>
      </Row>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 14 }}>
        Timezone: {prefs.timezone}{saving ? ' · saving…' : ''}
      </div>
    </div>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="np-row">
      <div style={{ minWidth: 0 }}>
        <div className="np-title">{title}</div>
        <div className="np-desc">{desc}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`np-toggle${on ? ' on' : ''}`}
      onClick={() => onChange(!on)}
      aria-pressed={on}
      aria-label="Toggle"
    />
  );
}
