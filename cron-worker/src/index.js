/**
 * Minimal cron companion worker for change-app.
 *
 * Fires on the schedule defined in wrangler.jsonc (every 5 minutes) and
 * POSTs the main app's /api/cron/notifications endpoint with a bearer
 * token. The main app does the actual dispatch (push fan-out, dedup, etc.).
 *
 * Required secrets (set via `wrangler secret put` inside this directory):
 *   - CRON_SECRET    same value as the main app's CRON_SECRET
 *
 * Optional vars (in wrangler.jsonc or dashboard):
 *   - APP_URL        the deployed main-app URL (no trailing slash)
 */

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runTick(env));
  },

  // Manual ping for debugging from a browser/curl:
  //   curl https://change-app-cron.<account>.workers.dev/?secret=<CRON_SECRET>
  async fetch(req, env) {
    const url = new URL(req.url);
    const provided = url.searchParams.get('secret');
    if (!env.CRON_SECRET || provided !== env.CRON_SECRET) {
      return new Response('forbidden', { status: 403 });
    }
    const result = await runTick(env);
    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'content-type': 'application/json' },
    });
  },
};

async function runTick(env) {
  if (!env.APP_URL) return { ok: false, error: 'APP_URL not set' };
  if (!env.CRON_SECRET) return { ok: false, error: 'CRON_SECRET not set' };

  try {
    const res = await fetch(`${env.APP_URL}/api/cron/notifications`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${env.CRON_SECRET}`,
        'content-type': 'application/json',
      },
      body: '{}',
    });
    const text = await res.text();
    console.log(`[cron-tick] ${res.status} ${text.slice(0, 200)}`);
    return { ok: res.ok, status: res.status, body: text.slice(0, 200) };
  } catch (e) {
    console.error('[cron-tick] error', e);
    return { ok: false, error: String(e) };
  }
}
