# change-app

Personal-tracking PWA — habits, tasks, diary, gym, recovery, and finance in
one single-user app. Next.js 16 (App Router + Turbopack), React 19, TypeScript
strict, Supabase, Google Gemini, deployed to Cloudflare Pages via OpenNext.

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Log in with the token set in `APP_TOKEN`.

## Environment

Required in `.env.local`:

- `APP_TOKEN` — the single access token; auth middleware sets an `app_token`
  cookie for a year.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — service-role client
  (`lib/supabase.ts`). API routes assume they run inside the middleware and do
  not re-check auth.
- `GOOGLE_API_KEY` — Gemini via `lib/ai.ts` (`gemini-2.5-flash` primary,
  `-lite` fallback). Not Anthropic/OpenAI.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — Web Push
  subscriptions (`lib/push.ts`).
- `CRON_SECRET` — bearer token the `/api/cron/notifications` dispatcher
  requires. Also used by the iOS Health Shortcut webhook.

## What's on each page

- **Home** (`/`) — CompletionRing hero (with the AI daily briefing inline),
  DailyTasks, DiaryCard (with inline mood pills), HabitList, a collapsible
  Habit history calendar, strong-only Insights, and a WeeklyReview that
  auto-generates on Sun/Mon.
- **Diary** (`/diary`) — Auto-saving textarea with mood, 30-day mood chart,
  searchable past entries with a heatmap, optional AI reflection prompt.
- **Gym** (`/gym`) — Start-workout CTA, body weight, health metrics (steps +
  sleep from iOS Shortcuts), workout history with 14-day adherence in its
  header, per-exercise sparklines, and progress graph. Split editor and rest
  timer live behind the Settings toggle.
- **Recovery** (`/recovery`) — StreakCard (with Momentum stats merged in),
  Crisis Mode entry, UrgeLog with a Play-the-tape trigger, UrgePatterns, and
  disclosures for Play-it-forward, Relapse prevention plan, and Relapse log.
- **Finance** (`/finance`) — Tabs for Net Worth, Spending (Plaid
  transactions), Subscriptions (manual + AI-detected). NW tab leads with the
  Cashflow card (In / Out / NW 30d / savings rate) then the donut + NW
  history chart with a 30 / 90 / 365 / all window toggle.
- **Coach** (`/coach`) — Streaming AI chat that gets a snapshot of your
  habits, recovery, workouts, and latest diary as system context
  (`lib/coach-context.ts`).
- **Settings** (`/settings`) — iOS-style grouped list. Push notifications,
  notification preferences, diagnostics, and the iOS Health import shortcut.

## Architecture

- **Auth** — `middleware.ts` gates every route on the `app_token` cookie.
  API handlers assume they are already authenticated; there is no `user_id`
  column anywhere.
- **Dates** — `lib/dates.ts` uses a 6 AM day boundary. Before 6 AM the
  "active date" is the previous calendar day. Use `getActiveDateString()`
  for "today" everywhere except Apple Health rows, which use plain calendar
  today so they match the Health tile.
- **AI** — All LLM calls go through `lib/ai.ts`. Endpoints under
  `app/api/ai/*` cache their outputs (weekly review, recovery patterns,
  briefing) so a page reload does not re-bill.
- **Notifications** — `lib/notifications.ts` runs on the cron endpoint every
  5 minutes; dedupe via the `notification_log` table. Web Push subscriptions
  live in `push_subscriptions`. Diagnostics dashboard at
  `/settings` → Diagnostics.
- **Health import** — iOS Shortcuts (`StepSync`, `SleepSync`) POST to
  `/api/health-import/webhook` with the `CRON_SECRET` bearer.
- **Insights** — `lib/correlations.ts` computes cross-domain patterns
  (habits ↔ recovery, workouts ↔ mood, etc.). Home shows strong signals
  only; the recovery page has its own patterns card for recovery-only data.

## Scripts

```bash
npm run dev         # Next dev (Turbopack) on :3000
npm run build       # Next production build
npm run start       # Serve the production build
npm run lint        # ESLint
npm run cf:build    # OpenNext build for Cloudflare
npm run cf:preview  # OpenNext build + wrangler dev
npm run cf:deploy   # OpenNext build + deploy to Cloudflare Pages
```

## Deploy

Cloudflare Pages via OpenNext (`open-next.config.ts`, `wrangler.jsonc`).
Cloudflare's GitHub integration auto-deploys on push to `main`. Manual
deploys use `npm run cf:deploy`. There is no Vercel deployment.
