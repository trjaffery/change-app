import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { callAI } from '@/lib/ai';

export const maxDuration = 30;

interface RequestBody {
  situation: string;
  now_label?: string; // client-formatted local time, e.g. "Saturday, 11:14 PM"
  hour_now?: number;  // 0..23 in user local time
}

/**
 * POST /api/ai/play-the-tape — the CBT "play the tape through" exercise.
 *
 * Now grounded in:
 *   - The user's actual current local time (named hour by hour in the output)
 *   - Their sobriety streak
 *   - Their RP plan (why + triggers + warning signs)
 *   - Their recent urge log (tag frequencies + avg intensity, last 14 days)
 *   - The most recent relapse note (if any)
 *
 * Empty fields gracefully drop out of the prompt.
 */
export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_API_KEY) return NextResponse.json({ error: 'GOOGLE_API_KEY not set' }, { status: 500 });

  try {
    const body = (await req.json()) as RequestBody;
    const situation = (body.situation ?? '').trim();
    if (!situation) return NextResponse.json({ error: 'situation required' }, { status: 400 });

    const nowLabel = (body.now_label ?? '').trim();
    const hourNow = typeof body.hour_now === 'number' && Number.isFinite(body.hour_now)
      ? Math.max(0, Math.min(23, Math.floor(body.hour_now)))
      : null;

    // ── Pull user context in parallel ──────────────────────────────────────
    const sb = supabaseServer();
    const fourteenAgoIso = new Date(Date.now() - 14 * 86400000).toISOString();
    const [settingsRes, planRes, urgesRes, relapsesRes] = await Promise.all([
      sb.from('recovery_settings').select('key, value'),
      sb.from('rp_plan').select('triggers, warning_signs, replacement_behaviors, why').eq('id', 1).maybeSingle(),
      sb.from('recovery_urges').select('intensity, note, tags, created_at').gte('created_at', fourteenAgoIso).order('created_at', { ascending: false }),
      sb.from('recovery_relapses').select('created_at, note').order('created_at', { ascending: false }).limit(1),
    ]);

    const settings: Record<string, string> = {};
    for (const s of settingsRes.data ?? []) settings[s.key] = s.value;
    const sobrietyStart = settings['sobriety_start'] ?? null;
    const streakDays = sobrietyStart ? Math.floor((Date.now() - new Date(sobrietyStart).getTime()) / 86400000) : null;

    const plan = (planRes.data ?? null) as { triggers?: string; warning_signs?: string; replacement_behaviors?: string; why?: string } | null;
    const why = plan?.why?.trim() ?? '';
    const triggers = plan?.triggers?.trim() ?? '';
    const warningSigns = plan?.warning_signs?.trim() ?? '';

    const urges = (urgesRes.data ?? []) as { intensity: number; note: string | null; tags: string[] | null; created_at: string }[];
    const tagFreq: Record<string, number> = {};
    for (const u of urges) for (const t of (u.tags ?? [])) tagFreq[t] = (tagFreq[t] ?? 0) + 1;
    const topTags = Object.entries(tagFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t, c]) => `${t} (${c})`)
      .join(', ');
    const avgIntensity = urges.length ? (urges.reduce((s, u) => s + u.intensity, 0) / urges.length).toFixed(1) : null;
    const recentNotes = urges.slice(0, 3).map(u => u.note?.trim()).filter((n): n is string => !!n);

    const lastRelapse = relapsesRes.data?.[0] as { created_at: string; note: string | null } | undefined;
    const daysSinceRelapse = lastRelapse ? Math.floor((Date.now() - new Date(lastRelapse.created_at).getTime()) / 86400000) : null;
    const lastRelapseNote = lastRelapse?.note?.trim() ?? '';

    // ── Build the prompt — empty sections drop out ─────────────────────────
    const lines: string[] = [];
    lines.push(`The user just wrote, in the present moment: "${situation}"`);
    lines.push('');
    lines.push('TIME CHECK');
    if (nowLabel) lines.push(`- Right now: ${nowLabel}`);
    if (hourNow !== null) lines.push(`- Current hour: ${hourNow}:00 (local)`);
    if (streakDays !== null) lines.push(`- Day ${streakDays} of sobriety`);
    if (daysSinceRelapse !== null && lastRelapse) {
      const noteFrag = lastRelapseNote ? ` ("${lastRelapseNote.slice(0, 140)}${lastRelapseNote.length > 140 ? '…' : ''}")` : '';
      lines.push(`- Last fall was ${daysSinceRelapse} day${daysSinceRelapse === 1 ? '' : 's'} ago${noteFrag}`);
    }

    if (why) {
      lines.push('');
      lines.push("THE USER'S OWN WHY (use this — name what they say they'd lose):");
      lines.push(why);
    }
    if (triggers) {
      lines.push('');
      lines.push('THEIR NAMED TRIGGERS:');
      lines.push(triggers);
    }
    if (warningSigns) {
      lines.push('');
      lines.push('WARNING SIGNS THEY WROTE FOR THEMSELVES:');
      lines.push(warningSigns);
    }
    if (urges.length > 0) {
      lines.push('');
      lines.push('RECENT URGE LOG (last 14 days):');
      if (topTags) lines.push(`- Most common tags: ${topTags}`);
      if (avgIntensity) lines.push(`- Avg intensity: ${avgIntensity}/5`);
      if (recentNotes.length > 0) lines.push(`- Recent notes: ${recentNotes.map(n => `"${n.slice(0, 120)}${n.length > 120 ? '…' : ''}"`).join(' · ')}`);
    }

    lines.push('');
    lines.push('TASK');
    lines.push('Walk the user through the realistic next 24 hours if they act on this urge.');
    lines.push("Use REAL hour markers (not abstract 'later that night'). Start at the moment right after acting on it (the next 10–30 minutes), then step forward to specific clock times anchored to the current hour above: late night, ~3 AM, fajr (~5:30 AM), waking up, afternoon, this time tomorrow.");
    lines.push("Reference their own why by name — what specifically do they lose. Reference their own triggers by name.");
    lines.push("Include: the immediate moment after, the shame at the specific hour it hits, the morning routine derailed, the streak reset to day 1, a conversation they wouldn't be able to have honestly, the day-after diminished.");
    lines.push('End with ONE short sentence about what is still here for them if they do not act on this.');
    lines.push('');
    lines.push('STYLE');
    lines.push('- 4–6 short paragraphs max.');
    lines.push('- Brutally specific. Never preachy. Never generic.');
    lines.push('- Banned filler: "stay strong", "you got this", "great foundation", "small consistent steps", "renewed focus".');
    lines.push('- The user is Muslim. Where it genuinely fits (fajr, dua, istiqama, the conversation in salah), weave in ONE Islamic reference — never forced, never the centerpiece.');

    const prompt = lines.join('\n');

    const text = await callAI(
      prompt,
      'You are a recovery coach using the "play the tape through" CBT technique. Be brutally specific and concrete — name actual clock hours, actual feelings, actual consequences drawn from the user\'s own words. Never preachy, never generic. 4–6 short paragraphs max. End with one short hopeful sentence about not acting on it.',
      900,
    );
    return NextResponse.json({ message: text });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[play-the-tape] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
