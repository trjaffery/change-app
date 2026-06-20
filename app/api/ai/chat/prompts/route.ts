import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

/**
 * Phase 3 #17: dynamic example prompts for the coach chat.
 *
 * Reads a small handful of signals and returns 3–4 contextual prompts so the
 * chat empty state isn't generic ("Why was last week hard?") when the user
 * actually has a recent urge or no workout logged for today's scheduled split.
 *
 * Falls back to the static prompts if no signals fire.
 */

const STATIC_FALLBACK = [
  'Why was last week hard?',
  'What should I focus on this Saturday?',
  'How does my net worth tie to my habits?',
  'Give me a 5-minute reset I can do right now.',
];

const DAYS_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function GET() {
  try {
    const sb = supabaseServer();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const todayDow = now.getDay();
    const sevenAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();

    const [urgesRes, sessionsRes, settingsRes, splitsRes, nwRes] = await Promise.all([
      sb.from('recovery_urges').select('intensity, tags, created_at').gte('created_at', sevenAgoIso).order('created_at', { ascending: false }).limit(5),
      sb.from('gym_sessions').select('date').eq('date', todayStr),
      sb.from('recovery_settings').select('key, value'),
      sb.from('splits').select('split_days(name, day_of_week)').eq('is_active', true).limit(1),
      sb.from('finance_nw_history').select('total, snapshot_date').gte('snapshot_date', new Date(Date.now() - 35 * 86400000).toISOString().split('T')[0]).order('snapshot_date'),
    ]);

    const prompts: string[] = [];
    const urges = urgesRes.data ?? [];

    // 1) Recent urge → "why did [day] hit me?"
    if (urges.length > 0) {
      const recent = urges[0];
      const day = DAYS_LABEL[new Date(recent.created_at).getDay()];
      prompts.push(`Why did ${day} hit me harder than I expected?`);
    }

    // 2) No workout today + today is a scheduled split day → "what's my workout"
    type SplitDay = { name: string; day_of_week: number[] | null };
    const splitDays = ((splitsRes.data?.[0]?.split_days ?? []) as unknown) as SplitDay[];
    const todaySplit = splitDays.find(d => d.day_of_week?.includes(todayDow));
    const didWorkoutToday = (sessionsRes.data ?? []).length > 0;
    if (todaySplit && !didWorkoutToday) {
      prompts.push(`What's my ${todaySplit.name.toLowerCase()} workout look like today?`);
    }

    // 3) NW trend
    const nw = nwRes.data ?? [];
    if (nw.length >= 2) {
      const newest = (nw[nw.length - 1].total as number) ?? 0;
      const oldest = (nw[0].total as number) ?? 0;
      if (oldest > 0) {
        const deltaPct = ((newest - oldest) / oldest) * 100;
        if (deltaPct <= -5) prompts.push('How do I stay motivated through a dip?');
        else if (deltaPct >= 5) prompts.push('What\'s working in my spending right now?');
      }
    }

    // 4) Streak milestone
    const settings: Record<string, string> = {};
    for (const s of settingsRes.data ?? []) settings[s.key] = s.value;
    const sobrietyStart = settings['sobriety_start'];
    if (sobrietyStart) {
      const days = Math.floor((Date.now() - new Date(sobrietyStart).getTime()) / 86400000);
      if ([7, 14, 30, 60, 90, 180, 365].some(m => Math.abs(days - m) <= 1)) {
        prompts.push(`What kept the streak through day ${days}?`);
      }
    }

    if (prompts.length === 0) return NextResponse.json({ prompts: STATIC_FALLBACK });
    // Cap at 4 dynamic prompts.
    return NextResponse.json({ prompts: prompts.slice(0, 4) });
  } catch (e) {
    console.error('[chat/prompts] error:', e);
    return NextResponse.json({ prompts: STATIC_FALLBACK });
  }
}
