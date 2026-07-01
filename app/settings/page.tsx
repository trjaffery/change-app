'use client';
import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Check, Share, Plus, Smartphone, Activity, Stethoscope, SlidersHorizontal } from 'lucide-react';
import { useToast } from '@/components/layout/Toast';
import NotificationPrefsCard from '@/components/settings/NotificationPrefsCard';
import DiagnosticsPanel from '@/components/settings/DiagnosticsPanel';
import HealthImportCard from '@/components/settings/HealthImportCard';
import PageHeader from '@/components/layout/PageHeader';
import ListRow from '@/components/layout/ListRow';
import BottomSheet from '@/components/layout/BottomSheet';

type State = 'unsupported' | 'needs-install' | 'denied' | 'idle' | 'subscribed';
type SheetKind = null | 'push' | 'prefs' | 'diagnostics' | 'health';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const navStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  if (navStandalone) return true;
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

export default function SettingsPage() {
  const toast = useToast();
  const [state, setState] = useState<State>('idle');
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }
    if (isIos() && !isStandalone()) { setState('needs-install'); return; }
    if (Notification.permission === 'denied') { setState('denied'); return; }
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) { setEndpoint(existing.endpoint); setState('subscribed'); }
      else setState('idle');
    } catch { setState('idle'); }
  }, []);

  useEffect(() => {
    refresh();
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refresh]);

  async function subscribe() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { if (perm === 'denied') setState('denied'); return; }
      const reg = await navigator.serviceWorker.ready;
      const vapidRes = await fetch('/api/push/vapid');
      const vapid = await vapidRes.json() as { publicKey?: string; error?: string };
      if (!vapid.publicKey) throw new Error(vapid.error ?? 'VAPID key unavailable');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
      });
      const json = sub.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys, label: navigator.userAgent.slice(0, 80) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEndpoint(sub.endpoint);
      setState('subscribed');
      toast({ kind: 'success', message: 'Notifications enabled' });
    } catch (e) {
      toast({ kind: 'error', message: e instanceof Error ? e.message : 'Subscribe failed' });
    } finally { setBusy(false); }
  }

  async function unsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe();
        await fetch('/api/push/subscribe', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
      }
      setEndpoint(null);
      setState('idle');
      setSheet(null);
      toast({ kind: 'success', message: 'Notifications disabled' });
    } catch (e) {
      toast({ kind: 'error', message: e instanceof Error ? e.message : 'Unsubscribe failed' });
    } finally { setBusy(false); }
  }

  async function sendTest() {
    if (!endpoint) return;
    setBusy(true);
    try {
      const res = await fetch('/api/push/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      const data = await res.json() as { sent?: number; failed?: number; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.sent) toast({ kind: 'success', message: 'Test sent — check your lock screen' });
      else toast({ kind: 'error', message: 'Push service rejected the test' });
    } catch (e) {
      toast({ kind: 'error', message: e instanceof Error ? e.message : 'Test failed' });
    } finally { setBusy(false); }
  }

  const pushStatusLabel = ({
    unsupported: 'Not supported',
    'needs-install': 'Install first',
    denied: 'Denied',
    idle: 'Off',
    subscribed: 'On',
  } as const)[state];
  const pushStatusTone =
    state === 'subscribed' ? 'var(--success)' :
    state === 'unsupported' || state === 'denied' ? 'var(--danger)' :
    'var(--text-tertiary)';

  return (
    <>
      <PageHeader title="Settings" accent="neutral" />

      <ListRow.Group label="Notifications">
        <ListRow
          leading={<Bell size={16} strokeWidth={1.75} />}
          title="Push notifications"
          subtitle="On-device alerts for habits, tasks, workouts"
          trailing={<span style={{ color: pushStatusTone, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{pushStatusLabel}</span>}
          chevron
          onClick={() => setSheet('push')}
        />
        <ListRow
          leading={<SlidersHorizontal size={16} strokeWidth={1.75} />}
          title="Preferences"
          subtitle="Times, quiet hours, per-notification toggles"
          chevron
          onClick={() => setSheet('prefs')}
          disabled={state !== 'subscribed'}
        />
        <ListRow
          leading={<Stethoscope size={16} strokeWidth={1.75} />}
          title="Diagnostics"
          subtitle="Cron health, subscriptions, recent log"
          chevron
          onClick={() => setSheet('diagnostics')}
          disabled={state !== 'subscribed'}
        />
      </ListRow.Group>

      <ListRow.Group label="Health & Apple Watch">
        <ListRow
          leading={<Activity size={16} strokeWidth={1.75} />}
          title="Health import"
          subtitle="Steps + sleep webhook + iOS Shortcut setup"
          chevron
          onClick={() => setSheet('health')}
        />
      </ListRow.Group>

      {/* Detail sheets ------------------------------------------------------ */}
      <BottomSheet open={sheet === 'push'} onClose={() => setSheet(null)} title="Push notifications">
        <PushSheetContent
          state={state}
          busy={busy}
          onSubscribe={subscribe}
          onSendTest={sendTest}
          onUnsubscribe={unsubscribe}
        />
      </BottomSheet>

      <BottomSheet open={sheet === 'prefs'} onClose={() => setSheet(null)} title="Preferences">
        <NotificationPrefsCard />
      </BottomSheet>

      <BottomSheet open={sheet === 'diagnostics'} onClose={() => setSheet(null)} title="Diagnostics">
        <DiagnosticsPanel />
      </BottomSheet>

      <BottomSheet open={sheet === 'health'} onClose={() => setSheet(null)} title="Health import">
        <HealthImportCard />
      </BottomSheet>
    </>
  );
}

// Inline the previous "notifications card" body, unchanged behavior; just
// hosted inside the bottom sheet now.
function PushSheetContent({
  state, busy, onSubscribe, onSendTest, onUnsubscribe,
}: {
  state: State; busy: boolean;
  onSubscribe: () => void; onSendTest: () => void; onUnsubscribe: () => void;
}) {
  return (
    <div style={{ padding: '18px 16px 24px' }}>
      {state === 'unsupported' && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          This browser doesn&apos;t support Web Push. Try the latest Safari (iOS 16.4+) or Chrome.
        </div>
      )}

      {state === 'needs-install' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)', fontSize: 14 }}>
            <Smartphone size={18} strokeWidth={1.75} />
            <span>Install to your home screen first — iOS only allows push notifications from installed PWAs.</span>
          </div>
          <ol style={{ margin: 0, paddingLeft: 22, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7 }}>
            <li>Open this page in <strong>Safari</strong> (not Chrome).</li>
            <li>Tap the <Share size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> share button at the bottom.</li>
            <li>Scroll and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong> <Plus size={12} style={{ display: 'inline', verticalAlign: '-2px' }} />.</li>
            <li>Open the Change icon from your home screen, come back here, and tap Enable.</li>
          </ol>
        </div>
      )}

      {state === 'denied' && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          You previously denied notifications. Go to iOS Settings → Notifications → Change and allow them, then come back.
        </div>
      )}

      {state === 'idle' && (
        <button
          onClick={onSubscribe}
          disabled={busy}
          className="btn-tonal btn-tonal-home"
        >
          <Bell size={16} strokeWidth={1.75} style={{ marginRight: 8 }} /> Enable notifications
        </button>
      )}

      {state === 'subscribed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--success)', fontSize: 13 }}>
            <Check size={15} strokeWidth={2} /> This device is subscribed.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={onSendTest} disabled={busy} className="btn-secondary" style={{ fontSize: 12 }}>
              Send test push
            </button>
            <button onClick={onUnsubscribe} disabled={busy} className="btn-danger" style={{ fontSize: 12 }}>
              <BellOff size={12} strokeWidth={1.75} style={{ marginRight: 6 }} /> Turn off
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
