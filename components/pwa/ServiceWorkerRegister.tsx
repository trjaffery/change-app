'use client';
import { useEffect } from 'react';

/**
 * Registers /sw.js once the page is interactive. Silent on failure — the
 * Settings page is responsible for surfacing "push isn't available here."
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    const onReady = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        /* swallow — user can retry from Settings */
      });
    };
    if (document.readyState === 'complete') onReady();
    else window.addEventListener('load', onReady, { once: true });
    return () => window.removeEventListener('load', onReady);
  }, []);
  return null;
}
