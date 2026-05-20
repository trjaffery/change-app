'use client';
import { useState, useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';

type Tab = 'networth' | 'subscriptions' | 'orders' | 'wishlist';
type Category = 'bank' | 'stocks' | 'crypto' | 'other';

interface FinanceItem { id: string; category: Category; name: string; value: number }
interface Subscription { id: string; name: string; amount: number; billing_cycle: string; next_renewal: string | null }
interface Order { id: string; name: string; amount: number; store: string | null; eta: string | null }
interface WishlistItem { id: string; name: string; amount: number; url: string | null }
interface PlaidAccount { account_id: string; name: string; type: string; subtype: string; balances: { current: number | null } }
interface PlaidConnection { institution_name: string | null; item_id: string; accounts: PlaidAccount[] }
interface SubCandidate { name: string; amount: number; billing_cycle: string; next_renewal: string; occurrences: number }

const CATEGORY_META: Record<Category, { label: string; color: string; icon: string }> = {
  bank:    { label: 'Bank',    color: '#6BE3A4', icon: '◉' },
  stocks:  { label: 'Stocks',  color: '#78B4FF', icon: '◈' },
  crypto:  { label: 'Crypto',  color: '#F2C063', icon: '◆' },
  other:   { label: 'Other',   color: '#B8B6B0', icon: '◎' },
};

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtDec(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function toMonthly(amount: number, cycle: string) {
  if (cycle === 'yearly') return amount / 12;
  if (cycle === 'quarterly') return amount / 3;
  if (cycle === 'weekly') return (amount * 52) / 12;
  return amount;
}

function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return null;
  const r = 52;
  const cx = 70;
  const cy = 70;
  const circ = 2 * Math.PI * r;
  let cumulative = 0;
  const segments = data.filter(d => d.value > 0).map(d => {
    const pct = d.value / total;
    const dash = pct * circ;
    const seg = { ...d, dash, gap: circ - dash, offset: cumulative };
    cumulative += dash;
    return seg;
  });
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="16" />
      {segments.map(s => (
        <circle
          key={s.label}
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={s.color}
          strokeWidth="16"
          strokeDasharray={`${s.dash} ${s.gap}`}
          strokeDashoffset={circ / 4 - s.offset}
          strokeLinecap="round"
        />
      ))}
      <text x={cx} y={cy - 5} textAnchor="middle" fill="#FAFAFA" fontSize="10" fontWeight="700" fontFamily="-apple-system,sans-serif">
        {fmt(total)}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#76746E" fontSize="8" fontFamily="-apple-system,sans-serif">
        net worth
      </text>
    </svg>
  );
}

function PlaidLinkButton({ onSuccess }: { onSuccess: () => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function initLink() {
    setLoading(true);
    try {
      const res = await fetch('/api/plaid/link-token', { method: 'POST' });
      const data = await res.json() as { link_token?: string; error?: unknown };
      if (data.link_token) setLinkToken(data.link_token);
      else console.error('Plaid link token error:', data.error);
    } finally {
      setLoading(false);
    }
  }

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (public_token, metadata) => {
      await fetch('/api/plaid/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token, metadata }),
      });
      setLinkToken(null);
      onSuccess();
    },
    onExit: () => setLinkToken(null),
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  return (
    <button
      className="btn-secondary"
      style={{ fontSize: 12, padding: '8px 14px' }}
      onClick={initLink}
      disabled={loading}
    >
      {loading ? 'Connecting…' : '+ Connect Bank Account'}
    </button>
  );
}

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>('networth');

  // Net worth
  const [items, setItems] = useState<FinanceItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [addingCat, setAddingCat] = useState<Category | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemValue, setNewItemValue] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editValue, setEditValue] = useState('');

  // Subscriptions
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [subsLoading, setSubsLoading] = useState(true);
  const [addingSub, setAddingSub] = useState(false);
  const [subForm, setSubForm] = useState({ name: '', amount: '', billing_cycle: 'monthly', next_renewal: '' });

  // Subscription scan
  const [scanLoading, setScanLoading] = useState(false);
  const [candidates, setCandidates] = useState<SubCandidate[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Orders
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [addingOrder, setAddingOrder] = useState(false);
  const [orderForm, setOrderForm] = useState({ name: '', amount: '', store: '', eta: '' });

  // Wishlist
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [wishlistLoading, setWishlistLoading] = useState(true);
  const [addingWish, setAddingWish] = useState(false);
  const [wishForm, setWishForm] = useState({ name: '', amount: '', url: '' });

  // Plaid
  const [plaidConns, setPlaidConns] = useState<PlaidConnection[]>([]);

  const fetchItems = useCallback(async () => {
    setItemsLoading(true);
    const res = await fetch('/api/finance/items');
    const d = await res.json() as FinanceItem[];
    setItems(Array.isArray(d) ? d : []);
    setItemsLoading(false);
  }, []);

  const fetchSubs = useCallback(async () => {
    setSubsLoading(true);
    const res = await fetch('/api/finance/subscriptions');
    const d = await res.json() as Subscription[];
    setSubs(Array.isArray(d) ? d : []);
    setSubsLoading(false);
  }, []);

  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true);
    const res = await fetch('/api/finance/orders');
    const d = await res.json() as Order[];
    setOrders(Array.isArray(d) ? d : []);
    setOrdersLoading(false);
  }, []);

  const fetchWishlist = useCallback(async () => {
    setWishlistLoading(true);
    const res = await fetch('/api/finance/wishlist');
    const d = await res.json() as WishlistItem[];
    setWishlist(Array.isArray(d) ? d : []);
    setWishlistLoading(false);
  }, []);

  const fetchPlaid = useCallback(async () => {
    const res = await fetch('/api/plaid/accounts');
    const d = await res.json() as PlaidConnection[];
    setPlaidConns(Array.isArray(d) ? d : []);
  }, []);

  useEffect(() => {
    fetchItems();
    fetchSubs();
    fetchOrders();
    fetchWishlist();
    fetchPlaid();
  }, [fetchItems, fetchSubs, fetchOrders, fetchWishlist, fetchPlaid]);

  // Computed totals
  const byCategory = (['bank', 'stocks', 'crypto', 'other'] as Category[]).reduce((acc, cat) => {
    acc[cat] = items.filter(i => i.category === cat).reduce((s, i) => s + i.value, 0);
    return acc;
  }, {} as Record<Category, number>);

  const allPlaidAccounts = plaidConns.flatMap(c => c.accounts);
  const isLiability = (a: PlaidAccount) => a.type === 'credit' || a.type === 'loan';
  const isInvestment = (a: PlaidAccount) => a.type === 'investment';

  const plaidBank = allPlaidAccounts.filter(a => !isLiability(a) && !isInvestment(a)).reduce((s, a) => s + (a.balances.current ?? 0), 0);
  const plaidInvestments = allPlaidAccounts.filter(isInvestment).reduce((s, a) => s + (a.balances.current ?? 0), 0);
  const plaidLiabilities = allPlaidAccounts.filter(isLiability).reduce((s, a) => s + (a.balances.current ?? 0), 0);

  const manualTotal = Object.values(byCategory).reduce((s, v) => s + v, 0);
  const totalAssets = manualTotal + plaidBank + plaidInvestments;
  const totalNetWorth = totalAssets - plaidLiabilities;

  const monthlyBurn = subs.reduce((s, sub) => s + toMonthly(sub.amount, sub.billing_cycle), 0);
  const totalOrders = orders.reduce((s, o) => s + o.amount, 0);
  const totalWishlist = wishlist.reduce((s, w) => s + w.amount, 0);

  const donutData = ([
    { label: 'Bank', value: byCategory.bank + plaidBank, color: CATEGORY_META.bank.color },
    { label: 'Stocks', value: byCategory.stocks + plaidInvestments, color: CATEGORY_META.stocks.color },
    { label: 'Crypto', value: byCategory.crypto, color: CATEGORY_META.crypto.color },
    { label: 'Other', value: byCategory.other, color: CATEGORY_META.other.color },
  ]).filter(d => d.value > 0);

  // Net worth CRUD
  async function addItem(cat: Category) {
    if (!newItemName || !newItemValue) return;
    await fetch('/api/finance/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: cat, name: newItemName, value: Number(newItemValue) }),
    });
    setNewItemName(''); setNewItemValue(''); setAddingCat(null);
    fetchItems();
  }

  async function saveEdit() {
    if (!editId) return;
    await fetch('/api/finance/items', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editId, name: editName, value: Number(editValue) }),
    });
    setEditId(null);
    fetchItems();
  }

  async function deleteItem(id: string) {
    await fetch('/api/finance/items', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchItems();
  }

  // Subscription CRUD
  async function addSub() {
    if (!subForm.name || !subForm.amount) return;
    await fetch('/api/finance/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subForm),
    });
    setSubForm({ name: '', amount: '', billing_cycle: 'monthly', next_renewal: '' });
    setAddingSub(false);
    fetchSubs();
  }

  async function deleteSub(id: string) {
    await fetch('/api/finance/subscriptions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchSubs();
  }

  async function scanTransactions() {
    setScanLoading(true);
    setCandidates(null);
    setDismissed(new Set());
    const res = await fetch('/api/plaid/transactions');
    const data = await res.json() as SubCandidate[];
    setCandidates(Array.isArray(data) ? data : []);
    setScanLoading(false);
  }

  async function confirmCandidate(c: SubCandidate) {
    await fetch('/api/finance/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: c.name, amount: c.amount, billing_cycle: c.billing_cycle, next_renewal: c.next_renewal }),
    });
    setDismissed(prev => new Set(prev).add(c.name));
    fetchSubs();
  }

  function dismissCandidate(name: string) {
    setDismissed(prev => new Set(prev).add(name));
  }

  // Order CRUD
  async function addOrder() {
    if (!orderForm.name || !orderForm.amount) return;
    await fetch('/api/finance/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderForm),
    });
    setOrderForm({ name: '', amount: '', store: '', eta: '' });
    setAddingOrder(false);
    fetchOrders();
  }

  async function deleteOrder(id: string) {
    await fetch('/api/finance/orders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchOrders();
  }

  // Wishlist CRUD
  async function addWish() {
    if (!wishForm.name || !wishForm.amount) return;
    await fetch('/api/finance/wishlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wishForm),
    });
    setWishForm({ name: '', amount: '', url: '' });
    setAddingWish(false);
    fetchWishlist();
  }

  async function deleteWish(id: string) {
    await fetch('/api/finance/wishlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchWishlist();
  }

  async function disconnectPlaid(item_id: string) {
    await fetch('/api/plaid/accounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id }),
    });
    fetchPlaid();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'networth', label: 'Net Worth' },
    { id: 'subscriptions', label: 'Subscriptions' },
    { id: 'orders', label: 'Orders' },
    { id: 'wishlist', label: 'Wishlist' },
  ];

  return (
    <>
      <style>{`
        .finance-tabs { display: flex; gap: 4px; margin-bottom: 20px; background: rgba(255,255,255,0.03); border-radius: 12px; padding: 4px; }
        .finance-tab {
          flex: 1; padding: 8px 10px; border-radius: 9px; border: none; cursor: pointer;
          font-family: var(--font-sans); font-size: 12px; font-weight: 600;
          background: transparent; color: var(--text-tertiary); transition: all 0.15s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .finance-tab.active { background: rgba(255,255,255,0.08); color: var(--text-primary); }
        .finance-tab:hover:not(.active) { color: var(--text-secondary); }
        .cat-section { margin-bottom: 20px; }
        .cat-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 8px;
        }
        .cat-label { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; display: flex; align-items: center; gap: 6px; }
        .cat-total { font-size: 12px; font-weight: 700; color: var(--text-secondary); }
        .finance-row {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px; border-radius: 10px;
          background: rgba(255,255,255,0.03); margin-bottom: 4px;
        }
        .finance-row-name { flex: 1; font-size: 13px; color: var(--text-primary); }
        .finance-row-value { font-size: 13px; font-weight: 700; color: var(--text-primary); }
        .finance-row-meta { font-size: 11px; color: var(--text-tertiary); }
        .finance-row-actions { display: flex; gap: 6px; }
        .icon-btn {
          background: none; border: none; cursor: pointer; color: var(--text-tertiary);
          font-size: 13px; padding: 2px 4px; border-radius: 4px; transition: color 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .icon-btn:hover { color: var(--text-secondary); }
        .icon-btn.danger:hover { color: var(--danger); }
        .add-form { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
        .add-form input { flex: 1; min-width: 80px; }
        .add-form input[type="number"] { max-width: 120px; }
        .nw-summary { display: flex; gap: 16px; align-items: center; margin-bottom: 24px; flex-wrap: wrap; }
        .nw-legend { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 160px; }
        .legend-row { display: flex; align-items: center; gap: 8px; }
        .legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .legend-label { font-size: 12px; color: var(--text-secondary); flex: 1; }
        .legend-pct { font-size: 11px; color: var(--text-tertiary); }
        .legend-val { font-size: 12px; font-weight: 700; color: var(--text-primary); }
        .stat-pill {
          display: inline-flex; align-items: baseline; gap: 4px;
          padding: 8px 14px; border-radius: 12px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          margin-bottom: 16px;
        }
        .stat-pill-num { font-size: 20px; font-weight: 700; color: var(--text-primary); }
        .stat-pill-label { font-size: 11px; color: var(--text-tertiary); }
        .pct-badge { font-size: 11px; color: var(--text-tertiary); margin-left: 4px; }
        .plaid-section { margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.06); }
        .plaid-conn { margin-bottom: 12px; }
        .plaid-inst { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between; }
        .sub-cycle { font-size: 10px; color: var(--text-tertiary); background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.06em; }
      `}</style>

      <h1 className="page-title">Finance</h1>

      <div className="finance-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`finance-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Net Worth Tab ── */}
      {tab === 'networth' && (
        <div>
          {itemsLoading ? (
            <div className="empty-state">Loading…</div>
          ) : (
            <>
              {/* Summary + donut */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="nw-summary">
                  <DonutChart data={donutData} />
                  <div className="nw-legend">
                    {([['bank', byCategory.bank + plaidBank], ['stocks', byCategory.stocks + plaidInvestments], ['crypto', byCategory.crypto], ['other', byCategory.other]] as [Category, number][]).map(([cat, val]) => (
                      <div key={cat} className="legend-row">
                        <div className="legend-dot" style={{ background: CATEGORY_META[cat].color }} />
                        <span className="legend-label">{CATEGORY_META[cat].label}</span>
                        <span className="legend-val">{fmt(val)}</span>
                        {totalAssets > 0 && val > 0 && (
                          <span className="legend-pct">{Math.round(val / totalAssets * 100)}%</span>
                        )}
                      </div>
                    ))}
                    {plaidLiabilities > 0 && (
                      <div className="legend-row">
                        <div className="legend-dot" style={{ background: 'var(--danger)' }} />
                        <span className="legend-label">Liabilities</span>
                        <span className="legend-val" style={{ color: 'var(--danger)' }}>−{fmt(plaidLiabilities)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Category sections */}
              {(['bank', 'stocks', 'crypto', 'other'] as Category[]).map(cat => {
                const catItems = items.filter(i => i.category === cat);
                const catTotal = catItems.reduce((s, i) => s + i.value, 0);
                const meta = CATEGORY_META[cat];
                return (
                  <div key={cat} className="cat-section">
                    <div className="cat-header">
                      <div className="cat-label">
                        <span style={{ color: meta.color }}>{meta.icon}</span>
                        <span style={{ color: meta.color }}>{meta.label}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {catTotal > 0 && <span className="cat-total">{fmt(catTotal)}</span>}
                        <button
                          className="icon-btn"
                          onClick={() => { setAddingCat(addingCat === cat ? null : cat); setNewItemName(''); setNewItemValue(''); }}
                          title="Add"
                        >+</button>
                      </div>
                    </div>

                    {catItems.length === 0 && addingCat !== cat && (
                      <div className="empty-state" style={{ textAlign: 'left', paddingLeft: 2 }}>No entries</div>
                    )}

                    {catItems.map(item => (
                      <div key={item.id} className="finance-row">
                        {editId === item.id ? (
                          <>
                            <input className="text-input finance-row-name" value={editName} onChange={e => setEditName(e.target.value)} style={{ padding: '4px 8px', fontSize: 13, minWidth: 0 }} />
                            <input className="text-input" type="number" value={editValue} onChange={e => setEditValue(e.target.value)} style={{ padding: '4px 8px', fontSize: 13, width: 100 }} />
                            <div className="finance-row-actions">
                              <button className="icon-btn" onClick={saveEdit} title="Save">✓</button>
                              <button className="icon-btn" onClick={() => setEditId(null)} title="Cancel">✕</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="finance-row-name">{item.name}</span>
                            <span className="finance-row-value">{fmt(item.value)}</span>
                            <div className="finance-row-actions">
                              <button className="icon-btn" onClick={() => { setEditId(item.id); setEditName(item.name); setEditValue(String(item.value)); }} title="Edit">✎</button>
                              <button className="icon-btn danger" onClick={() => deleteItem(item.id)} title="Delete">✕</button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}

                    {addingCat === cat && (
                      <div className="add-form">
                        <input
                          className="text-input"
                          placeholder={cat === 'bank' ? 'Account name' : cat === 'stocks' ? 'Ticker / name' : cat === 'crypto' ? 'Coin / wallet' : 'Item name'}
                          value={newItemName}
                          onChange={e => setNewItemName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addItem(cat)}
                          autoFocus
                          style={{ fontSize: 13, padding: '8px 12px' }}
                        />
                        <input
                          className="text-input"
                          type="number"
                          placeholder="Value ($)"
                          value={newItemValue}
                          onChange={e => setNewItemValue(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addItem(cat)}
                          style={{ fontSize: 13, padding: '8px 12px', width: 120 }}
                        />
                        <button className="btn-primary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => addItem(cat)}>Add</button>
                        <button className="btn-secondary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => setAddingCat(null)}>Cancel</button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Plaid connected accounts */}
              <div className="plaid-section">
                <div className="section-title">Connected Accounts</div>
                {plaidConns.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
                    Connect your bank to automatically sync balances.
                  </p>
                ) : (
                  plaidConns.map(conn => {
                    const assets = conn.accounts.filter(a => !isLiability(a));
                    const liabilities = conn.accounts.filter(isLiability);
                    return (
                      <div key={conn.item_id} className="plaid-conn">
                        <div className="plaid-inst">
                          <span>{conn.institution_name ?? 'Bank'}</span>
                          <button className="icon-btn danger" style={{ fontSize: 11 }} onClick={() => disconnectPlaid(conn.item_id)}>Disconnect</button>
                        </div>
                        {assets.map(acc => (
                          <div key={acc.account_id} className="finance-row">
                            <span className="finance-row-name">{acc.name}</span>
                            <span className="finance-row-meta" style={{ textTransform: 'capitalize' }}>{acc.subtype}</span>
                            <span className="finance-row-value">{acc.balances.current !== null ? fmt(acc.balances.current) : '—'}</span>
                          </div>
                        ))}
                        {liabilities.length > 0 && (
                          <>
                            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--danger)', opacity: 0.7, margin: '8px 0 4px 2px' }}>Liabilities</div>
                            {liabilities.map(acc => (
                              <div key={acc.account_id} className="finance-row" style={{ background: 'rgba(255,107,107,0.04)' }}>
                                <span className="finance-row-name">{acc.name}</span>
                                <span className="finance-row-meta" style={{ textTransform: 'capitalize' }}>{acc.subtype}</span>
                                <span className="finance-row-value" style={{ color: 'var(--danger)' }}>−{acc.balances.current !== null ? fmt(acc.balances.current) : '—'}</span>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    );
                  })
                )}
                <PlaidLinkButton onSuccess={fetchPlaid} />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Subscriptions Tab ── */}
      {tab === 'subscriptions' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
            <div className="stat-pill" style={{ marginBottom: 0 }}>
              <span className="stat-pill-num">{fmtDec(monthlyBurn)}</span>
              <span className="stat-pill-label">/month</span>
            </div>
            {plaidConns.length > 0 && (
              <button
                className="btn-secondary"
                style={{ fontSize: 12, padding: '8px 14px' }}
                onClick={scanTransactions}
                disabled={scanLoading}
              >
                {scanLoading ? 'Scanning…' : '⟳ Scan bank transactions'}
              </button>
            )}
          </div>

          {subsLoading ? (
            <div className="empty-state">Loading…</div>
          ) : (
            <>
              {subs.length === 0 && !addingSub && !candidates && (
                <div className="empty-state">No subscriptions yet</div>
              )}
              {subs.map(sub => (
                <div key={sub.id} className="finance-row" style={{ gap: 8 }}>
                  <span className="finance-row-name">{sub.name}</span>
                  <span className="sub-cycle">{sub.billing_cycle}</span>
                  <span className="finance-row-value">{fmtDec(sub.amount)}</span>
                  {sub.next_renewal && (
                    <span className="finance-row-meta">Renews {fmtDate(sub.next_renewal)}</span>
                  )}
                  <button className="icon-btn danger" onClick={() => deleteSub(sub.id)} title="Delete">✕</button>
                </div>
              ))}
              {addingSub ? (
                <div className="add-form" style={{ marginTop: 12 }}>
                  <input className="text-input" placeholder="Name (e.g. Netflix)" value={subForm.name} onChange={e => setSubForm(f => ({ ...f, name: e.target.value }))} autoFocus style={{ fontSize: 13, padding: '8px 12px' }} />
                  <input className="text-input" type="number" placeholder="Amount ($)" value={subForm.amount} onChange={e => setSubForm(f => ({ ...f, amount: e.target.value }))} style={{ fontSize: 13, padding: '8px 12px', width: 120 }} />
                  <select className="text-input" value={subForm.billing_cycle} onChange={e => setSubForm(f => ({ ...f, billing_cycle: e.target.value }))} style={{ fontSize: 13, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)' }}>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                  <input className="text-input" type="date" placeholder="Next renewal" value={subForm.next_renewal} onChange={e => setSubForm(f => ({ ...f, next_renewal: e.target.value }))} style={{ fontSize: 13, padding: '8px 12px', colorScheme: 'dark' }} />
                  <button className="btn-primary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={addSub}>Add</button>
                  <button className="btn-secondary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => setAddingSub(false)}>Cancel</button>
                </div>
              ) : (
                <button className="btn-secondary" style={{ marginTop: 12, fontSize: 12, padding: '8px 14px' }} onClick={() => setAddingSub(true)}>
                  + Add Manually
                </button>
              )}

              {/* Detected subscription candidates */}
              {candidates !== null && (
                <div style={{ marginTop: 24 }}>
                  <div className="section-title">Detected from transactions</div>
                  {(() => {
                    const existingNames = new Set(subs.map(s => s.name.toLowerCase()));
                    const visible = candidates.filter(c => !dismissed.has(c.name) && !existingNames.has(c.name.toLowerCase()));
                    if (visible.length === 0) return (
                      <div className="empty-state">No new recurring charges detected</div>
                    );
                    return visible.map(c => (
                      <div key={c.name} className="finance-row" style={{ gap: 8, border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 2 }}>{c.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {c.occurrences}× in 90 days · {c.billing_cycle} · next {fmtDate(c.next_renewal)}
                          </div>
                        </div>
                        <span className="finance-row-value">{fmtDec(c.amount)}</span>
                        <button
                          className="btn-primary"
                          style={{ fontSize: 11, padding: '5px 10px' }}
                          onClick={() => confirmCandidate(c)}
                        >
                          Add
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={() => dismissCandidate(c.name)}
                          title="Dismiss"
                        >✕</button>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Orders Tab ── */}
      {tab === 'orders' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
            <div className="stat-pill">
              <span className="stat-pill-num">{fmt(totalOrders)}</span>
              <span className="stat-pill-label">incoming</span>
            </div>
            {totalNetWorth > 0 && totalOrders > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {(totalOrders / totalNetWorth * 100).toFixed(1)}% of net worth
              </span>
            )}
          </div>

          {ordersLoading ? (
            <div className="empty-state">Loading…</div>
          ) : (
            <>
              {orders.length === 0 && !addingOrder && (
                <div className="empty-state">No incoming orders</div>
              )}
              {orders.map(order => (
                <div key={order.id} className="finance-row">
                  <span className="finance-row-name">{order.name}</span>
                  {order.store && <span className="finance-row-meta">from {order.store}</span>}
                  {order.eta && <span className="finance-row-meta">ETA {fmtDate(order.eta)}</span>}
                  <span className="finance-row-value">{fmt(order.amount)}</span>
                  <button className="icon-btn danger" onClick={() => deleteOrder(order.id)} title="Delete">✕</button>
                </div>
              ))}
              {addingOrder ? (
                <div className="add-form" style={{ marginTop: 12 }}>
                  <input className="text-input" placeholder="Item name" value={orderForm.name} onChange={e => setOrderForm(f => ({ ...f, name: e.target.value }))} autoFocus style={{ fontSize: 13, padding: '8px 12px' }} />
                  <input className="text-input" type="number" placeholder="Amount ($)" value={orderForm.amount} onChange={e => setOrderForm(f => ({ ...f, amount: e.target.value }))} style={{ fontSize: 13, padding: '8px 12px', width: 120 }} />
                  <input className="text-input" placeholder="Store (optional)" value={orderForm.store} onChange={e => setOrderForm(f => ({ ...f, store: e.target.value }))} style={{ fontSize: 13, padding: '8px 12px', width: 140 }} />
                  <input className="text-input" type="date" placeholder="ETA" value={orderForm.eta} onChange={e => setOrderForm(f => ({ ...f, eta: e.target.value }))} style={{ fontSize: 13, padding: '8px 12px', colorScheme: 'dark' }} />
                  <button className="btn-primary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={addOrder}>Add</button>
                  <button className="btn-secondary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => setAddingOrder(false)}>Cancel</button>
                </div>
              ) : (
                <button className="btn-secondary" style={{ marginTop: 12, fontSize: 12, padding: '8px 14px' }} onClick={() => setAddingOrder(true)}>
                  + Add Order
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Wishlist Tab ── */}
      {tab === 'wishlist' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
            <div className="stat-pill">
              <span className="stat-pill-num">{fmt(totalWishlist)}</span>
              <span className="stat-pill-label">wanted</span>
            </div>
            {totalNetWorth > 0 && totalWishlist > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {(totalWishlist / totalNetWorth * 100).toFixed(1)}% of net worth
              </span>
            )}
          </div>

          {wishlistLoading ? (
            <div className="empty-state">Loading…</div>
          ) : (
            <>
              {wishlist.length === 0 && !addingWish && (
                <div className="empty-state">Nothing on your wishlist yet</div>
              )}
              {wishlist.map(item => (
                <div key={item.id} className="finance-row">
                  <span className="finance-row-name">{item.name}</span>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--text-tertiary)', textDecoration: 'none' }} title={item.url}>↗</a>
                  )}
                  {totalNetWorth > 0 && (
                    <span className="pct-badge">{(item.amount / totalNetWorth * 100).toFixed(1)}%</span>
                  )}
                  <span className="finance-row-value">{fmt(item.amount)}</span>
                  <button className="icon-btn danger" onClick={() => deleteWish(item.id)} title="Delete">✕</button>
                </div>
              ))}
              {addingWish ? (
                <div className="add-form" style={{ marginTop: 12 }}>
                  <input className="text-input" placeholder="Item name" value={wishForm.name} onChange={e => setWishForm(f => ({ ...f, name: e.target.value }))} autoFocus style={{ fontSize: 13, padding: '8px 12px' }} />
                  <input className="text-input" type="number" placeholder="Price ($)" value={wishForm.amount} onChange={e => setWishForm(f => ({ ...f, amount: e.target.value }))} style={{ fontSize: 13, padding: '8px 12px', width: 120 }} />
                  <input className="text-input" placeholder="URL (optional)" value={wishForm.url} onChange={e => setWishForm(f => ({ ...f, url: e.target.value }))} style={{ fontSize: 13, padding: '8px 12px', flex: 2 }} />
                  <button className="btn-primary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={addWish}>Add</button>
                  <button className="btn-secondary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => setAddingWish(false)}>Cancel</button>
                </div>
              ) : (
                <button className="btn-secondary" style={{ marginTop: 12, fontSize: 12, padding: '8px 14px' }} onClick={() => setAddingWish(true)}>
                  + Add to Wishlist
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
