'use client';
import { useCallback, useEffect, useState } from 'react';

interface ActivityRow {
  id: string;
  action: 'add' | 'edit' | 'delete';
  entity_type: 'item' | 'subscription' | 'order' | 'wishlist';
  entity_id: string | null;
  snapshot: { name?: string; amount?: number; value?: number; category?: string; store?: string; billing_cycle?: string };
  created_at: string;
}

const ENTITY_LABEL: Record<ActivityRow['entity_type'], string> = {
  item: 'Account',
  subscription: 'Subscription',
  order: 'Order',
  wishlist: 'Wishlist',
};

const CAT_COLOR: Record<string, string> = {
  bank: '#6BE3A4', stocks: '#78B4FF', crypto: '#F2C063', other: '#B8B6B0',
  subscription: '#9B8EF7', order: '#FF9A5C', wishlist: '#E87FB0',
};

function rowColor(r: ActivityRow): string {
  if (r.entity_type === 'item' && r.snapshot.category) return CAT_COLOR[r.snapshot.category] ?? CAT_COLOR.other;
  return CAT_COLOR[r.entity_type] ?? CAT_COLOR.other;
}

function relativeDate(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yest';
  if (diffDays < 7) return `${diffDays}d`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtAmount(n: number | undefined): string {
  if (n === undefined) return '';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export default function ActivityLog({ refreshKey }: { refreshKey?: number }) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/finance/activity?limit=30');
      const data = (await res.json()) as ActivityRow[];
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) return null;
  if (rows.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-title">Recent activity</div>
      <style>{`
        .al-row { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
        .al-row:last-of-type { border-bottom: none; }
        .al-bar { width: 3px; height: 26px; border-radius: 2px; flex-shrink: 0; }
        .al-main { flex: 1; min-width: 0; }
        .al-name { font-size: 13px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .al-meta { font-family: var(--font-mono); font-size: 10px; color: var(--text-tertiary); letter-spacing: 0.04em; margin-top: 2px; }
        .al-amount { font-family: var(--font-mono); font-size: 12px; font-weight: 700; flex-shrink: 0; }
        .al-date { font-family: var(--font-mono); font-size: 10px; color: var(--text-tertiary); width: 36px; text-align: right; flex-shrink: 0; }
      `}</style>
      {rows.map(r => {
        const amount = r.snapshot.amount ?? r.snapshot.value;
        const actionSign = r.action === 'add' ? '+' : r.action === 'delete' ? '−' : '';
        const actionTone = r.action === 'add' ? 'var(--success)' : r.action === 'delete' ? 'var(--danger)' : 'var(--text-secondary)';
        return (
          <div key={r.id} className="al-row">
            <span className="al-bar" style={{ background: rowColor(r) }} />
            <div className="al-main">
              <div className="al-name">{r.snapshot.name ?? '(unnamed)'}</div>
              <div className="al-meta">
                {ENTITY_LABEL[r.entity_type]} · {r.action.toUpperCase()}
                {r.snapshot.store ? ` · ${r.snapshot.store}` : ''}
              </div>
            </div>
            {amount !== undefined && (
              <span className="al-amount" style={{ color: actionTone }}>
                {actionSign}{fmtAmount(amount)}
              </span>
            )}
            <span className="al-date">{relativeDate(r.created_at)}</span>
          </div>
        );
      })}
    </div>
  );
}
