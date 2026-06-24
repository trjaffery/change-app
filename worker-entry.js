// Custom Worker entry that wraps OpenNext's generated worker so we can
// add a scheduled() handler for Cloudflare Cron Triggers. The HTTP path
// is unchanged — we just forward fetch() through, and re-export the
// Durable Object classes (Cloudflare requires them to be named exports
// on the entry module).
//
// scheduled() fires on the cron schedule defined in wrangler.jsonc and
// calls /api/cron/notifications internally via the worker's own fetch
// handler. No public URL hop, no external pinger.

import openNextWorker from './.open-next/worker.js';

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './.open-next/worker.js';

export default {
  fetch: openNextWorker.fetch,

  async scheduled(_controller, env, ctx) {
    const secret = env.CRON_SECRET;
    if (!secret) {
      console.error('[cron] CRON_SECRET not set — skipping scheduled tick');
      return;
    }
    // Internal fetch — origin doesn't matter, the request never leaves
    // the worker, but Next's route handler needs an absolute URL.
    const req = new Request('https://internal.cron/api/cron/notifications', {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
    });
    ctx.waitUntil((async () => {
      try {
        const res = await openNextWorker.fetch(req, env, ctx);
        if (!res.ok) {
          console.error('[cron] dispatcher returned', res.status, await res.text());
        }
      } catch (e) {
        console.error('[cron] dispatcher threw', e);
      }
    })());
  },
};
