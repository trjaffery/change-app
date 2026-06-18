import type { SupabaseClient } from '@supabase/supabase-js';

export type ActivityAction = 'add' | 'edit' | 'delete';
// 'order' and 'wishlist' still exist as historic entity_type values in old
// finance_activity rows, but new writes can only be items or subscriptions.
export type ActivityEntity = 'item' | 'subscription';

/**
 * Append an entry to finance_activity. Fire-and-forget — never blocks the request
 * if it fails; logging shouldn't break the user's action.
 */
export async function logFinanceActivity(
  sb: SupabaseClient,
  action: ActivityAction,
  entity_type: ActivityEntity,
  entity_id: string | null,
  snapshot: Record<string, unknown>,
): Promise<void> {
  try {
    await sb.from('finance_activity').insert({
      action,
      entity_type,
      entity_id: entity_id ?? null,
      snapshot,
    });
  } catch (e) {
    console.error('[finance-activity] log failed:', e);
  }
}
