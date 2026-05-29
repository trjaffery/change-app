# Agent notes — change-app

Next.js **16.2.6** (App Router + Turbopack), React 19, TypeScript (strict). Standard
App Router conventions apply — route handlers export `GET`/`POST`/etc. from
`app/**/route.ts`; pages are `app/**/page.tsx`. No exotic deviations from the docs.

Key context:
- **Auth:** single-user, gated by `middleware.ts` via an `app_token` cookie (`APP_TOKEN` env). API routes assume they're already authenticated — no per-route auth or `user_id`.
- **Data:** Supabase via `lib/supabase.ts` (`supabaseServer()` uses the service-role key).
- **AI:** Google Gemini via `lib/ai.ts` (`callAI`, `GOOGLE_API_KEY`). Not Anthropic/OpenAI.
- **Dates:** `lib/dates.ts` uses a 6 AM day boundary — before 6 AM the "active date" is the previous calendar day. Use `getActiveDateString()` for "today".
- **Deploy:** Cloudflare Pages via OpenNext (`npm run cf:deploy`, `wrangler.jsonc`).
