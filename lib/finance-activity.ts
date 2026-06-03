import type { SupabaseClient } from '@supabase/supabase-js';

export type ActivityAction = 'add' | 'edit' | 'delete';
export type ActivityEntity = 'item' | 'subscription' | 'order' | 'wishlist';

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
