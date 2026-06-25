'use client';
import { useCallback, useEffect, useState } from 'react';
import { Activity, Copy, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/components/layout/Toast';
import { getActiveDateString } from '@/lib/dates';

interface Config {
  endpoint: string;
  token: string | null;
  configured: boolean;
  last: { date: string; steps: number | null; sleep_minutes: number | null; posted_at: string } | null;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  if (min < 60 * 24) return `${Math.round(min / 60)}h ago`;
  return `${Math.round(min / (60 * 24))}d ago`;
}

export default function HealthImportCard() {
  const toast = useToast();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [reveal, setReveal] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/health-import/config');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCfg(await res.json());
    } catch (e) {
      toast({ kind: 'error', message: e instanceof Error ? e.message : 'Failed to load config' });
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ kind: 'success', message: `${label} copied` });
    } catch {
      toast({ kind: 'error', message: 'Copy failed' });
    }
  }

  async function sendTest() {
    if (!cfg?.token) return;
    setTesting(true);
    try {
      const res = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify({ date: getActiveDateString(), steps: 9999, sleep_minutes: 444 }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast({ kind: 'success', message: 'Test row written' });
      await load();
    } catch (e) {
      toast({ kind: 'error', message: e instanceof Error ? e.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <style>{`
        .hi-field { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); }
        .hi-field code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hi-iconbtn { background: transparent; border: none; color: var(--text-tertiary); cursor: pointer; padding: 4px; display: inline-flex; align-items: center; -webkit-tap-highlight-color: transparent; }
        .hi-iconbtn:hover { color: var(--text-primary); }
        .hi-label { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
        .hi-help-toggle { background: transparent; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 7px 12px; color: var(--text-secondary); font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; -webkit-tap-highlight-color: transparent; }
        .hi-help { margin-top: 12px; padding: 12px; border-radius: 8px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); font-size: 12px; line-height: 1.55; color: var(--text-secondary); }
        .hi-help h4 { margin: 0 0 6px; font-size: 11px; color: var(--text-primary); font-weight: 700; }
        .hi-help ol { margin: 0 0 12px; padding-left: 18px; }
        .hi-help li { margin-bottom: 4px; }
        .hi-help code { font-family: var(--font-mono); font-size: 11px; color: var(--text-primary); background: rgba(255,255,255,0.04); padding: 1px 5px; border-radius: 4px; }
        .hi-test-btn { padding: 7px 12px; border-radius: 8px; background: transparent; border: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary); font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; -webkit-tap-highlight-color: transparent; }
        .hi-test-btn:hover { background: rgba(255,255,255,0.04); }
        .hi-test-btn:disabled { opacity: 0.4; cursor: default; }
      `}</style>

      <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Activity size={14} strokeWidth={1.75} /> Health import
      </div>

      {!cfg && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading…</div>
      )}

      {cfg && !cfg.configured && (
        <div className="empty-state" style={{ textAlign: 'left', fontSize: 12 }}>
          <code>HEALTH_IMPORT_SECRET</code> isn&apos;t set on the worker. Run <code>npx wrangler secret put HEALTH_IMPORT_SECRET</code> with any 32+ char random string, redeploy, then refresh this page.
        </div>
      )}

      {cfg && cfg.configured && (
        <>
          <div style={{ marginTop: 4 }}>
            <div className="hi-label">Endpoint</div>
            <div className="hi-field">
              <code>{cfg.endpoint}</code>
              <button className="hi-iconbtn" onClick={() => copy(cfg.endpoint, 'Endpoint')} aria-label="Copy endpoint"><Copy size={13} /></button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="hi-label">Bearer token</div>
            <div className="hi-field">
              <code>{reveal ? cfg.token : '•'.repeat(Math.min(28, cfg.token!.length))}</code>
              <button className="hi-iconbtn" onClick={() => setReveal(r => !r)} aria-label="Toggle reveal">
                {reveal ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button className="hi-iconbtn" onClick={() => copy(cfg.token!, 'Token')} aria-label="Copy token"><Copy size={13} /></button>
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)' }}>
              {cfg.last
                ? <>Last received <span style={{ color: 'var(--text-secondary)' }}>{timeAgo(cfg.last.posted_at)}</span> · {cfg.last.date}</>
                : 'No data received yet.'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="hi-help-toggle" onClick={() => setShowHelp(s => !s)}>
                {showHelp ? 'Hide setup' : 'Shortcut setup'}
              </button>
              <button className="hi-test-btn" disabled={testing} onClick={sendTest}>
                {testing ? 'Sending…' : 'Send test'}
              </button>
            </div>
          </div>

          {showHelp && (
            <div className="hi-help">
              <h4>Morning automation (~07:00)</h4>
              <ol>
                <li>Shortcuts app → <strong>+</strong> → <strong>Automation</strong> → <strong>Personal</strong> → <strong>Time of Day → 7:00 AM, Daily</strong></li>
                <li>Add action <strong>Find Sleep Analysis</strong> where State is <code>Asleep</code> in the last <code>1 day</code>, sort by Start Date</li>
                <li>Add action <strong>Calculate Statistics → Sum</strong> of the Duration property, then divide by <code>60</code> → save as <code>SleepMinutes</code></li>
                <li>Add action <strong>Find Health Sample</strong> where Type is <code>Step Count</code>, Date is <code>Yesterday</code></li>
                <li>Add action <strong>Calculate Statistics → Sum</strong> of Quantity → save as <code>Steps</code></li>
                <li>Add action <strong>Get Contents of URL</strong> → POST to <code>{cfg.endpoint}</code> with header <code>Authorization: Bearer (your token)</code> and body <code>{`{"date":"<yesterday YYYY-MM-DD>","steps":<Steps>,"sleep_minutes":<SleepMinutes>}`}</code></li>
              </ol>

              <h4>Evening automation (~21:00)</h4>
              <ol>
                <li>Same trigger pattern, time <strong>9:00 PM, Daily</strong></li>
                <li><strong>Find Health Sample</strong> where Type is <code>Step Count</code>, Date is <code>Today</code> → <strong>Sum</strong> → <code>Steps</code></li>
                <li>POST <code>{`{"date":"<today YYYY-MM-DD>","steps":<Steps>}`}</code> to the same endpoint</li>
              </ol>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Tip: format dates with the <strong>Format Date</strong> action set to <code>yyyy-MM-dd</code>. The morning Shortcut backfills yesterday&apos;s totals once they&apos;re final; the evening one keeps today&apos;s steps live.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
