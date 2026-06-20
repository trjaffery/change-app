'use client';
import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Check, Share, Plus, Smartphone } from 'lucide-react';
import { useToast } from '@/components/layout/Toast';

type State = 'unsupported' | 'needs-install' | 'denied' | 'idle' | 'subscribed';

// Convert a URL-safe base64 string into the Uint8Array PushManager wants.
// Returns a fresh ArrayBuffer-backed Uint8Array so it matches `BufferSource`
// (strict TS 5.7+ rejects the ambient `Uint8Array<ArrayBufferLike>` shape).
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
  // iOS exposes navigator.standalone; everyone else uses display-mode media query.
  const navStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  if (navStandalone) return true;
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

export default function SettingsPage() {
  const toast = useToast();
  const [state, setState] = useState<State>('idle');
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Detect environment + existing subscription on mount and whenever
  // visibility changes (user may have just installed/uninstalled).
  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }
    // On iOS, Web Push only works inside the installed PWA. In Safari proper
    // the APIs exist but the subscribe call will fail with a confusing error,
    // so we surface "install first" up-front.
    if (isIos() && !isStandalone()) {
      setState('needs-install');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        setEndpoint(existing.endpoint);
        setState('subscribed');
      } else {
        setState('idle');
      }
    } catch {
      setState('idle');
    }
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
      if (perm !== 'granted') {
        if (perm === 'denied') setState('denied');
        return;
      }
      const reg = await navigator.serviceWorker.ready;

      // Pull the VAPID public key from the server so we don't bake it into the bundle.
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
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: json.keys,
          label: navigator.userAgent.slice(0, 80),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setEndpoint(sub.endpoint);
      setState('subscribed');
      toast({ kind: 'success', message: 'Notifications enabled' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Subscribe failed';
      toast({ kind: 'error', message: msg });
    } finally {
      setBusy(false);
    }
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
      toast({ kind: 'success', message: 'Notifications disabled' });
    } catch (e) {
      toast({ kind: 'error', message: e instanceof Error ? e.message : 'Unsubscribe failed' });
    } finally {
      setBusy(false);
    }
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="page-title">Settings</h1>

      <div className="card" style={{ marginBottom: 22 }}>
        <div className="section-title">Notifications</div>

        {state === 'unsupported' && (
          <div className="empty-state" style={{ textAlign: 'left' }}>
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
          <div className="empty-state" style={{ textAlign: 'left' }}>
            You previously denied notifications. Go to iOS Settings → Notifications → Change and allow them, then come back.
          </div>
        )}

        {state === 'idle' && (
          <button
            onClick={subscribe}
            disabled={busy}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '12px 18px', borderRadius: 12,
              background: 'rgba(107,227,164,0.12)', border: '1px solid rgba(107,227,164,0.3)',
              color: 'var(--success)', fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 700,
              cursor: busy ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Bell size={16} strokeWidth={1.75} /> Enable notifications
          </button>
        )}

        {state === 'subscribed' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--success)', fontSize: 13 }}>
              <Check size={15} strokeWidth={2} /> This device is subscribed.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={sendTest}
                disabled={busy}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 10,
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                  color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 11,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  cursor: busy ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent',
                }}
              >
                Send test push
              </button>
              <button
                onClick={unsubscribe}
                disabled={busy}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 10,
                  background: 'transparent', border: '1px solid rgba(255,107,107,0.28)',
                  color: 'var(--danger)', fontFamily: 'var(--font-mono)', fontSize: 11,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  cursor: busy ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent',
                }}
              >
                <BellOff size={12} strokeWidth={1.75} /> Turn off
              </button>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Per-habit reminder times and the daily digest land in stage 2.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
