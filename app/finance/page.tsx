'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import EmptyState from '@/components/layout/EmptyState';
import ActivityLog from '@/components/finance/ActivityLog';
import {
  Landmark, TrendingUp, Bitcoin, Boxes,
  UtensilsCrossed, ShoppingBasket, ShoppingBag, Plane, Car, Tv,
  HeartPulse, Receipt, Code2, Sparkles, CircleDashed,
  Pencil, Trash2, RotateCw,
  type LucideIcon,
} from 'lucide-react';

function cacheSet(key: string, data: unknown, ttlMs: number) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, expires: Date.now() + ttlMs }));
  } catch { /* storage full — ignore */ }
}
function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, expires } = JSON.parse(raw) as { data: T; expires: number };
    if (Date.now() > expires) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

type Tab = 'networth' | 'subscriptions' | 'transactions';
type Category = 'bank' | 'stocks' | 'crypto' | 'other';

interface FinanceItem { id: string; category: Category; name: string; value: number }
interface Subscription { id: string; name: string; amount: number; billing_cycle: string; next_renewal: string | null }
interface PlaidAccount { account_id: string; name: string; official_name: string | null; mask: string | null; type: string; subtype: string; balances: { current: number | null; available: number | null } }
interface PlaidConnection { institution_name: string | null; item_id: string; accounts: PlaidAccount[] }
interface SubCandidate { name: string; amount: number; billing_cycle: string; next_renewal: string; occurrences: number }
interface PlaidTx { transaction_id: string; account_id?: string; merchant_name: string | null; name: string; amount: number; date: string; category: string[] | null; personal_finance_category?: { primary: string; detailed: string; confidence_level: string } | null; pending?: boolean }

const CAT_COLORS = ['#F2C063', '#6BE3A4', '#9B8EF7', '#60C6F0', '#F26363', '#FF9A5C', '#78B4FF', '#E07BB5'];

const PFC_MAP: Record<string, string> = {
  'FOOD_AND_DRINK':            'Food & Drink',
  'GENERAL_MERCHANDISE':       'Shopping',
  'HOME_IMPROVEMENT':          'Shopping',
  'ENTERTAINMENT':             'Entertainment',
  'TRANSPORTATION':            'Transport',
  'TRAVEL':                    'Travel',
  'MEDICAL':                   'Health & Fitness',
  'PERSONAL_CARE':             'Personal Care',
  'GENERAL_SERVICES':          'Bills & Utilities',
  'RENT_AND_UTILITIES':        'Bills & Utilities',
  'GOVERNMENT_AND_NON_PROFIT': 'Other',
  'INCOME':                    'Other',
  'TRANSFER_IN':               'Other',
  'TRANSFER_OUT':              'Other',
  'LOAN_PAYMENTS':             'Other',
  'BANK_FEES':                 'Other',
};

function inferCategory(name: string, merchant: string | null): string {
  const s = (merchant ?? name).toLowerCase();
  // Delivery apps classify as Food
  if (/uber eats|doordash|grubhub|instacart|postmates|door dash|seamless|caviar|gopuff/.test(s)) return 'Food & Drink';
  // Food: TST* prefix, common food keywords
  if (/tst\*|restaurant|cafe|coffee|donut|pizza|burger|taco|sushi|grill|diner|bistro|bakery|bbq|wing|sandwich|noodle|ramen|thai|chinese|mexican|italian|steakhouse|steak|smoothie|juice|boba|\btea\b|braum|ice cream|sweetie|creamery|gelato|frozen yogurt|dessert|dairy queen|cold stone|baskin|shake|candy|pastry|crepe|dutch bros|jamba|tropical smoothie|applebee|panera|ihop|denny|waffle house|chili|cracker barrel|buffalo wild|chicken|gyro|seafood|eatery|kitchen|brunch|breakfast|tavern|toast|waffle|pancake|bagel|deli|whataburger|chick-fil|chipotle|subway|starbucks|dunkin|mcdonald|wendy|taco bell|panda express|five guys|sonic |in-n-out|raising cane|food|dining/.test(s)) return 'Food & Drink';
  // Grocery
  if (/kroger|heb |h-e-b|whole foods|trader joe|aldi|publix|safeway|sprouts|walmart grocery|costco food|sam's club|grocery|supermarket/.test(s)) return 'Groceries';
  // Shopping / Retail
  if (/amazon|walmart|target|costco|best buy|bestbuy|ebay|etsy|nike|adidas|gap |zara|h&m|nordstrom|macy|kohl|tj maxx|marshall|ross |old navy|forever 21|uniqlo|clothing|apparel|fashion|boutique|merchandise/.test(s)) return 'Shopping';
  // Rideshare / transport (non-food uber)
  if (/uber|lyft|taxi|rideshare|transit|toll|train|amtrak|parking|metro /.test(s)) return 'Transport';
  // Travel
  if (/airline|delta|united|southwest|american air|jetblue|spirit air|frontier|hotel|marriott|hilton|hyatt|airbnb|vrbo|expedia|booking\.com|priceline|travel|flight|airport|rental car|hertz|enterprise|avis/.test(s)) return 'Travel';
  // Entertainment
  if (/netflix|hulu|disney|hbo|max |spotify|apple music|amazon prime|youtube|twitch|playstation|xbox|steam|nintendo|movie|cinema|theater|ticketmaster|stubhub|concert|entertainment|recreation/.test(s)) return 'Entertainment';
  // Fitness
  if (/gym|fitness|planet fitness|crossfit|peloton|anytime fitness|la fitness|24 hour/.test(s)) return 'Health & Fitness';
  // Health / Medical
  if (/cvs|walgreens|rite aid|pharmacy|doctor|hospital|dental|clinic|health|medical|vision|optom|chiropract|therapy|urgent care/.test(s)) return 'Health & Fitness';
  // Gas / Auto
  if (/racetrac|shell |exxon|chevron|bp |mobil|sunoco|marathon|speedway|gas station|fuel|autozone|jiffy lube|oil change|car wash|mechanic|tires|midas|firestone|napa auto/.test(s)) return 'Transport';
  // Bills / Utilities
  if (/at&t|verizon|t-mobile|tmobile|sprint|comcast|xfinity|spectrum|cox |dish |directv|utility|electric|water bill|sewer|internet|cable|wireless|phone bill/.test(s)) return 'Bills & Utilities';
  // Software / Subscriptions
  if (/claude|openai|chatgpt|microsoft|google one|icloud|dropbox|adobe|slack|zoom|notion|github|aws |azure|digital ocean|software|saas/.test(s)) return 'Software';
  // Personal Care
  if (/salon|spa|barber|hair |nail |beauty|skincare|sephora|ulta|massage|wax/.test(s)) return 'Personal Care';
  return 'Other';
}

// PFC categories that are too broad to trust alone — refine with regex
const VAGUE_PFC = new Set(['GENERAL_MERCHANDISE', 'GENERAL_SERVICES']);

// Merchant overrides — these WIN over Plaid's personal_finance_category, because Plaid
// routinely mis-classifies merchants where the brand and the actual purchase diverge
// (e.g. Buc-ee's tagged as merchandise, HEB gas tagged as food because HEB is a grocer).
// Both `name` and `merchant_name` are concatenated so qualifiers like "GAS/CARWASH" in
// the longer `name` field aren't missed when `merchant_name` is just the bare brand.
// Add new patterns here as they crop up.
function merchantOverride(name: string, merchant: string | null): string | null {
  const s = `${name} ${merchant ?? ''}`.toLowerCase();
  // Travel plaza chain — always Transport
  if (/buc-?ee/.test(s)) return 'Transport';
  // Grocer-branded fuel stations: parent brand + a fuel keyword anywhere in the string
  const isFuelPurchase = /\b(gas|fuel|gasoline|fuelcenter|fuel center|carwash|car wash)\b/.test(s);
  if (isFuelPurchase) {
    if (/\bh-?e-?b\b/.test(s)) return 'Transport';
    if (/\bcostco\b/.test(s)) return 'Transport';
    if (/\bsam'?s\s*club\b/.test(s)) return 'Transport';
    if (/\bkroger\b/.test(s)) return 'Transport';
    if (/\bwalmart\b/.test(s)) return 'Transport';
  }
  // Pure travel-plaza / convenience-store gas brands
  if (/\b(wawa|sheetz|quiktrip|quick trip|loves travel|love's travel|pilot travel|flying j|ta travel|wally's|royal farms)\b/.test(s)) return 'Transport';
  return null;
}

function txCat(tx: { name: string; merchant_name: string | null; category: string[] | null; personal_finance_category?: { primary: string } | null }): string {
  // Merchant overrides take precedence over everything else.
  const override = merchantOverride(tx.name, tx.merchant_name);
  if (override) return override;
  const pfc = tx.personal_finance_category?.primary;
  // Specific PFC categories — trust them completely
  if (pfc && !VAGUE_PFC.has(pfc)) return PFC_MAP[pfc] ?? 'Other';
  // Vague or missing PFC — try regex refinement first
  const inferred = inferCategory(tx.name, tx.merchant_name);
  if (inferred !== 'Other') return inferred;
  // Regex couldn't improve on it — fall back to vague PFC or legacy category
  if (pfc) return PFC_MAP[pfc] ?? 'Other';
  return tx.category?.[0] ?? 'Other';
}

function getCatIcon(cat: string): LucideIcon {
  const c = cat.toLowerCase();
  if (/grocer/.test(c)) return ShoppingBasket;
  if (/food|drink|restaurant|dining/.test(c)) return UtensilsCrossed;
  if (/shop|retail|clothing|merchandise/.test(c)) return ShoppingBag;
  if (/travel|airline|hotel|flight/.test(c)) return Plane;
  if (/transport|uber|lyft|transit|parking|gas|fuel|auto/.test(c)) return Car;
  if (/entertain|recreation|movie|game/.test(c)) return Tv;
  if (/health|medical|pharmacy|doctor|dental|fitness|gym/.test(c)) return HeartPulse;
  if (/bill|utilit|phone|internet|cable/.test(c)) return Receipt;
  if (/software|subscription|saas|cloud/.test(c)) return Code2;
  if (/personal care|beauty|salon|spa/.test(c)) return Sparkles;
  return CircleDashed;
}

const CATEGORY_META: Record<Category, { label: string; color: string; Icon: LucideIcon }> = {
  bank:    { label: 'Bank',    color: '#6BE3A4', Icon: Landmark },
  stocks:  { label: 'Stocks',  color: '#78B4FF', Icon: TrendingUp },
  crypto:  { label: 'Crypto',  color: '#F2C063', Icon: Bitcoin },
  other:   { label: 'Other',   color: '#B8B6B0', Icon: Boxes },
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

function toYearly(amount: number, cycle: string) {
  if (cycle === 'yearly') return amount;
  if (cycle === 'quarterly') return amount * 4;
  if (cycle === 'weekly') return amount * 52;
  return amount * 12;
}

function daysUntil(d: string | null) {
  if (!d) return null;
  return Math.ceil((new Date(d + 'T12:00:00').getTime() - new Date().setHours(12, 0, 0, 0)) / 86400000);
}

function withinDays(dateStr: string, days: number): boolean {
  return Date.now() - new Date(dateStr + 'T12:00:00').getTime() <= days * 86400000;
}

function daysSinceDate(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr + 'T12:00:00').getTime()) / 86400000);
}

function DonutChart({ data, netWorth, centerLabel = 'net worth' }: { data: { label: string; value: number; color: string }[]; netWorth: number; centerLabel?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return null;
  const r = 58;
  const cx = 80;
  const cy = 80;
  const circ = 2 * Math.PI * r;
  const segments = data.filter(d => d.value > 0).reduce<Array<typeof data[number] & { dash: number; gap: number; offset: number }>>((acc, d) => {
    const dash = (d.value / total) * circ;
    const offset = acc.length === 0 ? 0 : acc[acc.length - 1].offset + acc[acc.length - 1].dash;
    acc.push({ ...d, dash, gap: circ - dash, offset });
    return acc;
  }, []);
  return (
    <svg width="160" height="160" viewBox="0 0 160 160" style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="18" />
      {segments.map(s => (
        <circle
          key={s.label}
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={s.color}
          strokeWidth="18"
          strokeDasharray={`${s.dash} ${s.gap}`}
          strokeDashoffset={circ / 4 - s.offset}
          strokeLinecap="round"
        />
      ))}
      <text x={cx} y={cy - 6} textAnchor="middle" fill={netWorth < 0 ? '#FF6B6B' : '#FAFAFA'} fontSize="15" fontWeight="700" fontFamily="-apple-system,sans-serif">
        {netWorth < 0 ? '−' : ''}{fmt(Math.abs(netWorth))}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="#76746E" fontSize="10" fontFamily="-apple-system,sans-serif">
        {centerLabel}
      </text>
    </svg>
  );
}

function NWChart({ data }: { data: { total: number; snapshot_date: string }[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (data.length < 2) return null;

  const W = 600, H = 110, PX = 12, PT = 8, PB = 22;
  const innerW = W - PX * 2;
  const innerH = H - PT - PB;

  // Pad y-range by ~5% so the line doesn't kiss the top/bottom edges.
  const rawMin = Math.min(...data.map(d => d.total));
  const rawMax = Math.max(...data.map(d => d.total));
  const pad = (rawMax - rawMin) * 0.05 || Math.abs(rawMax) * 0.04 || 1;
  const min = rawMin - pad;
  const max = rawMax + pad;
  const range = max - min || 1;

  const pts = data.map((d, i) => ({
    x: PX + (i / (data.length - 1)) * innerW,
    y: PT + innerH - ((d.total - min) / range) * innerH,
    total: d.total,
    date: d.snapshot_date,
  }));
  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
  const rising = data[data.length - 1].total >= data[0].total;
  const color = rising ? '#6BE3A4' : '#FF6B6B';
  const last = pts[pts.length - 1];

  // 4 sparse axis ticks: start, ~1/3, ~2/3, end (or all points if fewer than 4).
  const tickIdx = data.length <= 4
    ? data.map((_, i) => i)
    : [0, Math.round((data.length - 1) / 3), Math.round((2 * (data.length - 1)) / 3), data.length - 1];
  const fmtAxisDate = (s: string) =>
    new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  function onPointer(e: React.PointerEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0, best = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i].x - svgX);
      if (d < best) { best = d; nearest = i; }
    }
    setHoverIdx(nearest);
  }

  // Header shows hovered point if hovering, else the latest.
  const displayIdx = hoverIdx ?? data.length - 1;
  const display = data[displayIdx];
  const displayDelta = displayIdx > 0 ? display.total - data[displayIdx - 1].total : 0;
  const hover = hoverIdx !== null ? pts[hoverIdx] : null;

  return (
    <div>
      {/* Header: value + day-over-day delta + date. Swaps to hovered point during scrub. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6, paddingLeft: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: display.total < 0 ? '#FF6B6B' : 'var(--text-primary)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
          {display.total < 0 ? '−' : ''}{fmt(Math.abs(display.total))}
        </span>
        {displayDelta !== 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: displayDelta >= 0 ? 'var(--success)' : 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>
            {displayDelta >= 0 ? '+' : '−'}{fmt(Math.abs(displayDelta))}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginLeft: 'auto', paddingRight: 4 }}>
          {fmtAxisDate(display.snapshot_date)}
        </span>
      </div>

      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', touchAction: 'none', cursor: 'crosshair', maxHeight: 220, margin: '0 auto' }}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="nwg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id="nw-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <polygon points={`${PX},${PT + innerH} ${polyline} ${PX + innerW},${PT + innerH}`} fill="url(#nwg)" />

        {/* dashed mean line for context */}
        {data.length >= 4 && (() => {
          const meanTotal = data.reduce((s, d) => s + d.total, 0) / data.length;
          const meanY = PT + innerH - ((meanTotal - min) / range) * innerH;
          return (
            <line x1={PX} y1={meanY} x2={PX + innerW} y2={meanY} stroke={color} strokeOpacity="0.32" strokeWidth="1.1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          );
        })()}

        <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" filter="url(#nw-glow)" vectorEffect="non-scaling-stroke" />
        <circle cx={pts[0].x} cy={pts[0].y} r="2.5" fill={color} opacity="0.5" />
        <circle cx={last.x} cy={last.y} r="4" fill="#FFFFFF" stroke={color} strokeWidth="2" filter="url(#nw-glow)" />

        {/* X-axis: 4 sparse date ticks */}
        {tickIdx.map((i, k) => (
          <text
            key={i}
            x={pts[i].x}
            y={H - 6}
            fill="#76746E"
            fontSize="9"
            textAnchor={k === 0 ? 'start' : k === tickIdx.length - 1 ? 'end' : 'middle'}
            fontFamily="-apple-system,sans-serif"
          >
            {fmtAxisDate(data[i].snapshot_date)}
          </text>
        ))}

        {/* Hover crosshair (header above shows the value/date) */}
        {hover && (
          <>
            <line x1={hover.x} y1={PT} x2={hover.x} y2={PT + innerH} stroke="rgba(255,255,255,0.22)" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
            <circle cx={hover.x} cy={hover.y} r="4" fill={color} stroke="rgba(0,0,0,0.55)" strokeWidth="1" />
          </>
        )}
      </svg>
    </div>
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
      localStorage.removeItem('plaid_accounts');
      localStorage.removeItem('plaid_transactions');
      localStorage.removeItem('plaid_transactions_1y');
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

  // Expanded Plaid account rows in category sections
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  function toggleAccount(id: string) {
    setExpandedAccounts(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // Subscription view
  const [costView, setCostView] = useState<'monthly' | 'yearly'>('monthly');

  // Savings rate
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState('');

  // Subscription scan
  const [scanLoading, setScanLoading] = useState(false);
  const [candidates, setCandidates] = useState<SubCandidate[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Plaid
  const [plaidConns, setPlaidConns] = useState<PlaidConnection[]>([]);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  // Transactions
  const [transactions, setTransactions] = useState<PlaidTx[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txFilter, setTxFilter] = useState<string | null>(null);
  const [txRange, setTxRange] = useState<7 | 30 | 90 | 365>(30);
  const [expandedTx, setExpandedTx] = useState<string | null>(null);
  const txFetched = useRef(false);
  const subsFetched = useRef(false);

  // NW history
  const [nwHistory, setNwHistory] = useState<{ total: number; snapshot_date: string }[]>([]);
  const hasSnapshotted = useRef(false);

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

  const fetchPlaid = useCallback(async (): Promise<PlaidConnection[]> => {
    const cached = cacheGet<PlaidConnection[]>('plaid_accounts');
    if (cached) setPlaidConns(cached);
    try {
      const res = await fetch('/api/plaid/accounts');
      if (!res.ok) { if (!cached) setPlaidConns([]); return cached ?? []; }
      const d = await res.json() as PlaidConnection[];
      const conns = Array.isArray(d) ? d : [];
      setPlaidConns(conns);
      cacheSet('plaid_accounts', conns, 5 * 60 * 1000);
      return conns;
    } catch {
      if (!cached) setPlaidConns([]);
      return cached ?? [];
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    // Fetch the full 1y window once; client-side range picker slices into 7/30/90/365.
    const cached = cacheGet<PlaidTx[]>('plaid_transactions_1y');
    if (cached) { setTransactions(cached); setTxLoading(false); }
    else setTxLoading(true);
    try {
      const res = await fetch('/api/plaid/transactions?feed=true&days=365');
      if (!res.ok) return;
      const d = await res.json() as PlaidTx[];
      const txns = Array.isArray(d) ? d : [];
      setTransactions(txns);
      cacheSet('plaid_transactions_1y', txns, 30 * 60 * 1000);
    } catch { /* ignore */ } finally {
      setTxLoading(false);
    }
  }, []);

  const fetchNWHistory = useCallback(async () => {
    const res = await fetch('/api/finance/nw-history');
    const d = await res.json() as { total: number; snapshot_date: string }[];
    setNwHistory(Array.isArray(d) ? d : []);
  }, []);

  async function snapshotNW(total: number) {
    await fetch('/api/finance/nw-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ total }),
    });
    fetchNWHistory();
  }

  async function syncAccount(item_id: string) {
    setSyncingIds(prev => new Set(prev).add(item_id));
    const res = await fetch(`/api/plaid/accounts?item_id=${item_id}`);
    const updated = await res.json() as PlaidConnection[];
    setPlaidConns(prev => prev.map(c => {
      const fresh = updated.find(u => u.item_id === c.item_id);
      return fresh ?? c;
    }));
    // recompute total with updated connection merged in
    const merged = plaidConns.map(c => { const f = updated.find(u => u.item_id === c.item_id); return f ?? c; });
    const allAcc = merged.flatMap(c => c.accounts);
    const isLiab = (a: PlaidAccount) => a.type === 'credit' || a.type === 'loan';
    const assets = allAcc.filter(a => !isLiab(a)).reduce((s, a) => s + (a.balances.current ?? 0), 0);
    const liabs = allAcc.filter(isLiab).reduce((s, a) => s + (a.balances.current ?? 0), 0);
    await snapshotNW(manualTotal + assets - liabs);
    setSyncingIds(prev => { const n = new Set(prev); n.delete(item_id); return n; });
  }

  useEffect(() => {
    fetchItems();
    fetchPlaid();
    fetchNWHistory();
  }, [fetchItems, fetchPlaid, fetchNWHistory]);

  useEffect(() => {
    const stored = localStorage.getItem('finance_monthly_income');
    if (stored) setMonthlyIncome(Number(stored));
  }, []);

  function saveIncome() {
    const val = Number(incomeInput);
    setMonthlyIncome(val);
    localStorage.setItem('finance_monthly_income', String(val));
    setEditingIncome(false);
  }

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

  // Auto-snapshot once per page load after both items and plaid are ready
  useEffect(() => {
    if (!itemsLoading && !hasSnapshotted.current && (items.length > 0 || plaidConns.length > 0)) {
      hasSnapshotted.current = true;
      snapshotNW(totalNetWorth);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsLoading, plaidConns]);

  const monthlyBurn = subs.reduce((s, sub) => s + toMonthly(sub.amount, sub.billing_cycle), 0);
  const yearlyBurn = subs.reduce((s, sub) => s + toYearly(sub.amount, sub.billing_cycle), 0);
  const savingsRate = monthlyIncome > 0 ? Math.max(0, (monthlyIncome - monthlyBurn) / monthlyIncome * 100) : 0;
  const sortedSubs = [...subs].sort((a, b) => {
    if (!a.next_renewal && !b.next_renewal) return 0;
    if (!a.next_renewal) return 1;
    if (!b.next_renewal) return -1;
    return new Date(a.next_renewal).getTime() - new Date(b.next_renewal).getTime();
  });
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

  async function disconnectPlaid(item_id: string) {
    await fetch('/api/plaid/accounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id }),
    });
    localStorage.removeItem('plaid_accounts');
    localStorage.removeItem('plaid_transactions');
    txFetched.current = false;
    fetchPlaid();
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'networth', label: 'Home' },
    { id: 'transactions', label: 'Spending' },
    { id: 'subscriptions', label: 'Subscriptions' },
  ];

  function handleTabChange(id: Tab) {
    setTab(id);
    if (id === 'transactions' && !txFetched.current && plaidConns.length > 0) {
      txFetched.current = true;
      fetchTransactions();
    }
    if (id === 'subscriptions' && !subsFetched.current) {
      subsFetched.current = true;
      fetchSubs();
    }
  }

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
        .sub-urgent { background: rgba(242,192,99,0.07) !important; border: 1px solid rgba(242,192,99,0.18) !important; }
        .cost-toggle { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; display: flex; overflow: hidden; }
        .cost-toggle-btn { border: none; cursor: pointer; font-family: var(--font-sans); font-size: 11px; font-weight: 600; padding: 5px 11px; background: transparent; color: var(--text-tertiary); transition: all 0.15s; }
        .cost-toggle-btn.active { background: rgba(255,255,255,0.1); color: var(--text-primary); }
      `}</style>

      <h1 className="page-title">Finance</h1>

      <div className="finance-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`finance-tab${tab === t.id ? ' active' : ''}`} onClick={() => handleTabChange(t.id)}>
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
                  <DonutChart data={donutData} netWorth={totalNetWorth} />
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
                {nwHistory.length >= 2 && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <NWChart data={nwHistory} />
                  </div>
                )}
              </div>

              {/* Savings Rate */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Savings Rate</div>
                  {!editingIncome && (
                    <button className="icon-btn" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center' }} onClick={() => { setEditingIncome(true); setIncomeInput(monthlyIncome > 0 ? String(monthlyIncome) : ''); }} aria-label="Edit income"><Pencil size={13} strokeWidth={1.75} /></button>
                  )}
                </div>
                {editingIncome ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      className="text-input"
                      type="number"
                      placeholder="Monthly income ($)"
                      value={incomeInput}
                      onChange={e => setIncomeInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveIncome()}
                      autoFocus
                      style={{ fontSize: 13, padding: '8px 12px', flex: 1, minWidth: 160 }}
                    />
                    <button className="btn-primary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={saveIncome}>Save</button>
                    <button className="btn-secondary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => setEditingIncome(false)}>Cancel</button>
                  </div>
                ) : monthlyIncome > 0 ? (
                  <div>
                    <div style={{ display: 'flex', gap: 24, marginBottom: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 3 }}>Income</div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtDec(monthlyIncome)}<span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }}>/mo</span></div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 3 }}>Subscriptions</div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtDec(monthlyBurn)}<span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }}>/mo</span></div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 3 }}>Savings rate</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: savingsRate >= 20 ? 'var(--success)' : savingsRate >= 10 ? '#F2C063' : 'var(--danger)' }}>
                          {savingsRate.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(savingsRate, 100)}%`, height: '100%', background: savingsRate >= 20 ? 'var(--success)' : savingsRate >= 10 ? '#F2C063' : 'var(--danger)', borderRadius: 4, transition: 'width 0.4s ease' }} />
                    </div>
                    {(() => {
                      const monthlyNet = monthlyIncome - monthlyBurn;
                      const yearProj = monthlyNet * 12;
                      const tone = monthlyNet >= 0 ? 'var(--success)' : 'var(--danger)';
                      return (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>12-month projection</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: tone, letterSpacing: '-0.01em' }}>
                            {monthlyNet >= 0 ? '+' : '−'}{fmt(Math.abs(yearProj))}
                          </div>
                        </div>
                      );
                    })()}
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6 }}>Based on tracked subscriptions · savings from other spending not included</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                    Set your monthly income to track your savings rate.{' '}
                    <button style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }} onClick={() => { setEditingIncome(true); setIncomeInput(''); }}>
                      Set income
                    </button>
                  </div>
                )}
              </div>

              {/* Category sections */}
              {(['bank', 'stocks', 'crypto', 'other'] as Category[]).map(cat => {
                const PLAID_CAT: Record<string, Category> = { depository: 'bank', investment: 'stocks', other: 'other' };
                const catItems = items.filter(i => i.category === cat);
                const plaidAccounts = allPlaidAccounts.filter(a => !isLiability(a) && PLAID_CAT[a.type] === cat);
                const plaidBankNet = cat === 'bank'
                  ? plaidConns.reduce((s, conn) => {
                      const a = conn.accounts.filter(a => !isLiability(a) && !isInvestment(a)).reduce((x, a) => x + (a.balances.current ?? 0), 0);
                      const l = conn.accounts.filter(isLiability).reduce((x, a) => x + (a.balances.current ?? 0), 0);
                      return s + a - l;
                    }, 0)
                  : plaidAccounts.reduce((s, a) => s + (a.balances.current ?? 0), 0);
                const catTotal = catItems.reduce((s, i) => s + i.value, 0) + plaidBankNet;
                const meta = CATEGORY_META[cat];
                const MetaIcon = meta.Icon;
                return (
                  <div key={cat} className="cat-section">
                    <div className="cat-header">
                      <div className="cat-label">
                        <span style={{ color: meta.color, display: 'inline-flex', alignItems: 'center' }}>
                          <MetaIcon size={14} strokeWidth={1.75} />
                        </span>
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

                    {catItems.length === 0 && (cat === 'bank' ? plaidConns.length === 0 : plaidAccounts.length === 0) && addingCat !== cat && (
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
                              <button className="icon-btn" onClick={() => { setEditId(item.id); setEditName(item.name); setEditValue(String(item.value)); }} title="Edit" aria-label="Edit"><Pencil size={13} strokeWidth={1.75} /></button>
                              <button className="icon-btn danger" onClick={() => deleteItem(item.id)} title="Delete" aria-label="Delete"><Trash2 size={13} strokeWidth={1.75} /></button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}

                    {/* Plaid accounts — institution groups for Bank, flat list for other categories */}
                    {cat === 'bank' ? plaidConns.map(conn => {
                      const depsAssets = conn.accounts.filter(a => !isLiability(a) && !isInvestment(a));
                      const connLiabilities = conn.accounts.filter(isLiability);
                      const connNet = depsAssets.reduce((s, a) => s + (a.balances.current ?? 0), 0)
                                    - connLiabilities.reduce((s, a) => s + (a.balances.current ?? 0), 0);
                      const expanded = expandedAccounts.has(conn.item_id);
                      return (
                        <div key={conn.item_id}>
                          <div className="finance-row" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleAccount(conn.item_id)}>
                            <span className="finance-row-name">{conn.institution_name ?? 'Bank'}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>auto</span>
                            <span className="finance-row-value" style={{ color: connNet < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                              {connNet < 0 ? '−' : ''}{fmt(Math.abs(connNet))}
                            </span>
                            <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
                          </div>
                          {expanded && (
                            <div style={{ padding: '10px 14px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '0 0 10px 10px', marginTop: -4, marginBottom: 4 }}>
                              {depsAssets.length > 0 && (
                                <>
                                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--success)', opacity: 0.7, marginBottom: 6 }}>Assets</div>
                                  {depsAssets.map(acc => (
                                    <div key={acc.account_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                                      <span style={{ color: 'var(--text-secondary)' }}>{acc.official_name ?? acc.name}{acc.mask ? ` ••••${acc.mask}` : ''}</span>
                                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{acc.balances.current !== null ? fmtDec(acc.balances.current) : '—'}</span>
                                    </div>
                                  ))}
                                </>
                              )}
                              {connLiabilities.length > 0 && (
                                <>
                                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--danger)', opacity: 0.7, margin: '10px 0 6px' }}>Liabilities</div>
                                  {connLiabilities.map(acc => (
                                    <div key={acc.account_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                                      <span style={{ color: 'var(--text-secondary)' }}>{acc.official_name ?? acc.name}{acc.mask ? ` ••••${acc.mask}` : ''}</span>
                                      <span style={{ color: 'var(--danger)', fontWeight: 600 }}>−{acc.balances.current !== null ? fmtDec(acc.balances.current) : '—'}</span>
                                    </div>
                                  ))}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }) : plaidAccounts.map(acc => (
                      <div key={acc.account_id}>
                        <div className="finance-row" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleAccount(acc.account_id)}>
                          <span className="finance-row-name">{acc.official_name ?? acc.name}{acc.mask ? ` ••••${acc.mask}` : ''}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>auto</span>
                          <span className="finance-row-value">{acc.balances.current !== null ? fmt(acc.balances.current) : '—'}</span>
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>{expandedAccounts.has(acc.account_id) ? '▲' : '▼'}</span>
                        </div>
                        {expandedAccounts.has(acc.account_id) && (
                          <div style={{ padding: '10px 14px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '0 0 10px 10px', marginTop: -4, marginBottom: 4 }}>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'capitalize', marginBottom: 8 }}>{acc.subtype}</div>
                            <div style={{ display: 'flex', gap: 20 }}>
                              <div>
                                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 3 }}>Current</div>
                                <div style={{ fontSize: 14, fontWeight: 700 }}>{acc.balances.current !== null ? fmtDec(acc.balances.current) : '—'}</div>
                              </div>
                              {acc.balances.available !== null && acc.balances.available !== acc.balances.current && (
                                <div>
                                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 3 }}>Available</div>
                                  <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtDec(acc.balances.available)}</div>
                                </div>
                              )}
                            </div>
                          </div>
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

              {/* Recent activity log — refreshes whenever any tracked entity count changes */}
              <ActivityLog refreshKey={items.length + subs.length} />

              {/* Plaid connected accounts */}
              <div className="plaid-section">
                <div className="section-title">Connected Accounts</div>
                {plaidConns.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
                    Connect your bank to automatically sync balances.
                  </p>
                ) : (
                  plaidConns.map(conn => (
                    <div key={conn.item_id} className="finance-row">
                      <span className="finance-row-name">{conn.institution_name ?? 'Bank'}</span>
                      <button
                        className="icon-btn"
                        style={{ fontSize: 13 }}
                        onClick={() => syncAccount(conn.item_id)}
                        disabled={syncingIds.has(conn.item_id)}
                        title="Sync"
                        aria-label="Sync account"
                      >{syncingIds.has(conn.item_id) ? '…' : <RotateCw size={13} strokeWidth={1.75} />}</button>
                      <button className="icon-btn danger" style={{ fontSize: 12 }} onClick={() => disconnectPlaid(conn.item_id)} title="Disconnect">✕</button>
                    </div>
                  ))
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="stat-pill" style={{ marginBottom: 0 }}>
                <span className="stat-pill-num">{fmtDec(costView === 'monthly' ? monthlyBurn : yearlyBurn)}</span>
                <span className="stat-pill-label">{costView === 'monthly' ? '/month' : '/year'}</span>
              </div>
              <div className="cost-toggle">
                <button className={`cost-toggle-btn${costView === 'monthly' ? ' active' : ''}`} onClick={() => setCostView('monthly')}>Monthly</button>
                <button className={`cost-toggle-btn${costView === 'yearly' ? ' active' : ''}`} onClick={() => setCostView('yearly')}>Annual</button>
              </div>
            </div>
            {plaidConns.length > 0 && (
              <button
                className="btn-secondary"
                style={{ fontSize: 12, padding: '8px 14px' }}
                onClick={scanTransactions}
                disabled={scanLoading}
              >
                {scanLoading ? 'Scanning…' : <><RotateCw size={12} strokeWidth={1.75} style={{ verticalAlign: 'text-bottom', marginRight: 5 }} /> Scan bank transactions</>}
              </button>
            )}
          </div>

          {subsLoading ? (
            <div className="empty-state">Loading…</div>
          ) : (
            <>
              {subs.length === 0 && !addingSub && !candidates && (
                <EmptyState
                  glyph="◌"
                  title="No subscriptions tracked"
                  description="Add what you pay for monthly so the savings rate stays honest. Or scan Plaid for recurring charges."
                  action={{ label: '+ Add manually', onClick: () => setAddingSub(true) }}
                />
              )}
              {sortedSubs.map(sub => {
                const days = daysUntil(sub.next_renewal);
                const urgent = days !== null && days >= 0 && days <= 7;
                const moAmt = toMonthly(sub.amount, sub.billing_cycle);
                const yrAmt = toYearly(sub.amount, sub.billing_cycle);
                return (
                  <div key={sub.id} className={`finance-row${urgent ? ' sub-urgent' : ''}`} style={{ gap: 8 }}>
                    <span className="finance-row-name">{sub.name}</span>
                    <span className="sub-cycle">{sub.billing_cycle}</span>
                    <div style={{ textAlign: 'right' }}>
                      <div className="finance-row-value" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{fmtDec(moAmt)}<span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400 }}>/mo</span></div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{fmtDec(yrAmt)}/yr</div>
                    </div>
                    {sub.next_renewal && (
                      <span className="finance-row-meta" style={urgent ? { color: '#F2C063', fontWeight: 600, whiteSpace: 'nowrap' } : { whiteSpace: 'nowrap' }}>
                        {urgent ? (days === 0 ? 'today' : `in ${days}d`) : `Renews ${fmtDate(sub.next_renewal)}`}
                      </span>
                    )}
                    <button className="icon-btn danger" onClick={() => deleteSub(sub.id)} title="Delete">✕</button>
                  </div>
                );
              })}
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

      {/* ── Spending / Transactions Tab ── */}
      {tab === 'transactions' && (() => {
        if (!plaidConns.length) {
          return <div className="empty-state">Connect a bank account to see your spending.</div>;
        }
        if (txLoading) return <div className="empty-state">Loading transactions…</div>;

        // Time-range filter — apply before any aggregation so donut, bars, list, and total all agree.
        const inRange = transactions.filter(t => withinDays(t.date, txRange));

        // Compute category breakdown — infer from merchant name if Plaid returns null
        const catTotals = new Map<string, number>();
        for (const tx of inRange) {
          const cat = txCat(tx);
          catTotals.set(cat, (catTotals.get(cat) ?? 0) + tx.amount);
        }
        const topCats = [...catTotals.entries()].sort((a, b) => b[1] - a[1]);
        const maxCatTotal = topCats[0]?.[1] ?? 1;
        const totalSpent = inRange.reduce((s, t) => s + t.amount, 0);
        // Assign stable colors to categories by their sorted rank
        const catColorMap = new Map(topCats.map(([cat], i) => [cat, CAT_COLORS[i % CAT_COLORS.length]]));
        const donutData = topCats.map(([cat, total]) => ({ label: cat, value: total, color: catColorMap.get(cat) ?? CAT_COLORS[0] }));

        // Build account lookup: account_id → { name, mask, institution, subtype }
        const accountMap = new Map<string, { name: string; official_name: string | null; mask: string | null; institution: string | null; subtype: string }>();
        for (const conn of plaidConns) {
          for (const acc of conn.accounts) {
            accountMap.set(acc.account_id, { name: acc.name, official_name: acc.official_name ?? null, mask: acc.mask ?? null, institution: conn.institution_name, subtype: acc.subtype });
          }
        }

        // Filtered + grouped by date
        const filtered = txFilter
          ? inRange.filter(t => txCat(t) === txFilter)
          : inRange;
        const byDate = new Map<string, PlaidTx[]>();
        for (const tx of filtered) {
          if (!byDate.has(tx.date)) byDate.set(tx.date, []);
          byDate.get(tx.date)!.push(tx);
        }
        const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

        // Hide range pills the connected banks can't actually serve. Plaid+the bank
        // determine how far back transactions go; offering "1y" when only ~120 days
        // are available is misleading. Show a pill if the user has at least
        // (value − 10 days) of history. Pre-fetch state assumes max history so all
        // pills appear while loading.
        const txOldestDays = transactions.length === 0
          ? 365
          : Math.max(...transactions.map(t => daysSinceDate(t.date)));
        const ALL_RANGES: { value: 7 | 30 | 90 | 365; label: string }[] = [
          { value: 7, label: '7d' }, { value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 365, label: '1y' },
        ];
        const visibleRanges = ALL_RANGES.filter(r => r.value <= txOldestDays + 10);

        return (
          <>
            {/* Summary */}
            <div className="card" style={{ marginBottom: 16 }}>
              {/* Range picker — only pills the bank-provided history can fill */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                {visibleRanges.length < ALL_RANGES.length && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>
                    ~{txOldestDays}d AVAILABLE
                  </span>
                )}
                <div className="cost-toggle">
                  {visibleRanges.map(r => (
                    <button
                      key={r.value}
                      className={`cost-toggle-btn${txRange === r.value ? ' active' : ''}`}
                      onClick={() => setTxRange(r.value)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3 }}>SPENT — LAST {txRange === 365 ? '365 DAYS' : `${txRange} DAYS`}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>${totalSpent.toFixed(0)}</div>
                </div>
                {txFilter && (
                  <button onClick={() => setTxFilter(null)} style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                    Clear filter
                  </button>
                )}
              </div>

              {/* Donut + category bars side by side */}
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                {donutData.length > 0 && (
                  <DonutChart data={donutData} netWorth={totalSpent} centerLabel="spent" />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 200 }}>
                  {topCats.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No transactions in this range.</div>
                  )}
                  {topCats.map(([cat, total]) => {
                    const color = catColorMap.get(cat) ?? CAT_COLORS[0];
                    const CatIcon = getCatIcon(cat);
                    const isActive = txFilter === cat;
                    return (
                      <div key={cat} onClick={() => setTxFilter(isActive ? null : cat)} style={{ cursor: 'pointer', opacity: txFilter && !isActive ? 0.45 : 1, transition: 'opacity 0.15s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: isActive ? color : 'var(--text-secondary)', fontWeight: isActive ? 600 : 400, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <CatIcon size={13} strokeWidth={1.75} />
                            {cat}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>${total.toFixed(0)}</span>
                        </div>
                        <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                          <div style={{ width: `${(total / maxCatTotal) * 100}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Transaction list */}
            <div className="card">
              {sortedDates.length === 0 && <div className="empty-state">No transactions to show.</div>}
              {sortedDates.map(date => (
                <div key={date}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', margin: '10px 0 6px', letterSpacing: '0.04em' }}>
                    {fmtDate(date)}
                  </div>
                  {byDate.get(date)!.map(tx => {
                    const cat = txCat(tx);
                    const color = catColorMap.get(cat) ?? 'rgba(255,255,255,0.3)';
                    const CatIcon = getCatIcon(cat);
                    const isOpen = expandedTx === tx.transaction_id;
                    const acct = tx.account_id ? accountMap.get(tx.account_id) : undefined;
                    return (
                      <div key={tx.transaction_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div
                          onClick={() => setExpandedTx(isOpen ? null : tx.transaction_id)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', cursor: 'pointer' }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {tx.name}
                            </div>
                            <div style={{ fontSize: 11, color, marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                              <CatIcon size={11} strokeWidth={1.75} />
                              {cat}{tx.pending ? ' · Pending' : ''}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgba(255,100,100,0.85)' }}>
                              −${tx.amount.toFixed(2)}
                            </div>
                            <span style={{ fontSize: 9, color: 'var(--text-tertiary)', opacity: 0.6 }}>{isOpen ? '▲' : '▼'}</span>
                          </div>
                        </div>
                        {isOpen && (
                          <div style={{ padding: '8px 12px 10px', margin: '0 0 4px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: 12 }}>
                            {acct ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                                    {acct.institution ?? 'Bank'}{acct.mask ? ` ••••${acct.mask}` : ''}
                                  </div>
                                  <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 2, textTransform: 'capitalize' }}>
                                    {acct.official_name ?? acct.name} · {acct.subtype.replace(/_/g, ' ')}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-tertiary)' }}>Account info unavailable</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        );
      })()}
    </>
  );
}
