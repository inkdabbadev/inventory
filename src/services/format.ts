import type { MovementView } from './inventory';
import { fmtQty } from './inventory';

/** Human-readable one-liner for a movement, used in history lists. */
export function describeMovement(m: MovementView): string {
  const qty = m.quantity != null ? `${fmtQty(Math.abs(m.quantity))} ${m.unit ?? ''}`.trim() : '';
  switch (m.type) {
    case 'issue':
      return `Issued${m.project_name ? ` to ${m.project_name}` : ''}${m.expected_return ? ` · due ${m.expected_return}` : ''}`;
    case 'return':
      return `Returned${m.to_location_name ? ` to ${m.to_location_name}` : ''}`;
    case 'consume':
      return `Used ${qty}${m.project_name ? ` for ${m.project_name}` : ''}`;
    case 'receive':
      return `Received ${qty}`;
    case 'adjust':
      return `Audit adjustment ${m.quantity! > 0 ? '+' : '−'}${qty}`;
    case 'transfer':
      return `Moved to ${m.to_location_name ?? 'new location'}`;
    case 'maintenance':
      return 'Sent to maintenance';
    case 'restore':
      return 'Back from maintenance';
    default:
      return m.type;
  }
}

export const syncLabel = (s: string) => (s === 'pending' ? '· not synced' : s === 'conflict' ? '· sync conflict' : '');

import type { IconName } from '../components/ui';
import { colors } from '../theme';

export const MOVEMENT_ICON: Record<string, { icon: IconName; color: string }> = {
  issue: { icon: 'arrow-up-circle', color: colors.warning },
  return: { icon: 'arrow-down-circle', color: colors.success },
  consume: { icon: 'remove-circle', color: colors.secondary },
  receive: { icon: 'add-circle', color: colors.primary },
  adjust: { icon: 'git-compare', color: colors.textMuted },
  transfer: { icon: 'swap-horizontal', color: colors.primary },
  maintenance: { icon: 'construct', color: colors.error },
  restore: { icon: 'checkmark-done-circle', color: colors.success },
};

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
