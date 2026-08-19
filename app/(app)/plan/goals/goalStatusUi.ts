import type { GoalStatus } from '@/lib/projections'

export function statusLabel(status: GoalStatus): string {
  if (status === 'ahead') return 'Ahead'
  if (status === 'on_track') return 'On track'
  if (status === 'behind') return 'Behind'
  return 'Add a date and monthly plan'
}

export function statusChipClass(status: GoalStatus): string {
  if (status === 'ahead') return 'bg-emerald-500/15 text-emerald-400'
  if (status === 'on_track') return 'bg-primary/15 text-primary'
  if (status === 'behind') return 'bg-amber-500/15 text-amber-400'
  return 'bg-muted text-muted-foreground'
}
