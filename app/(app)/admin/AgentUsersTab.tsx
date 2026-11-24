/**
 * Users tab: one row per person, allowance dollars plus call counts.
 */

'use client'

import { format } from 'date-fns'
import type { AiUserStatRow } from '@/app/actions/aiUserStats'
import { formatEstimatedUsd } from '@/lib/aiUsage/decide'

function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return format(d, 'd MMM yyyy HH:mm')
}

export default function AgentUsersTab({
  rows,
  loading,
  error,
  onOpenRuns,
}: {
  rows: AiUserStatRow[]
  loading: boolean
  error: string | null
  onOpenRuns: (userId: string) => void
}) {
  if (error) {
    return <p className="text-sm text-red-400 py-6 text-center">{error}</p>
  }
  if (loading && rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Loading users…
      </p>
    )
  }
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No users yet.
      </p>
    )
  }

  return (
    <div className="overflow-auto min-h-0 flex-1 border border-border rounded-md">
      <table className="w-full text-left text-xs min-w-[64rem]">
        <thead className="sticky top-0 bg-background border-b border-border">
          <tr className="text-muted-foreground">
            <th className="px-2 py-1.5 font-medium">Caller</th>
            <th className="px-2 py-1.5 font-medium">Period</th>
            <th className="px-2 py-1.5 font-medium">All time</th>
            <th className="px-2 py-1.5 font-medium">Eval</th>
            <th className="px-2 py-1.5 font-medium">Calls</th>
            <th className="px-2 py-1.5 font-medium">Most used</th>
            <th className="px-2 py-1.5 font-medium">Last call</th>
            <th className="px-2 py-1.5 font-medium">Errors</th>
            <th className="px-2 py-1.5 font-medium">Last error</th>
            <th className="px-2 py-1.5 font-medium">Confirm blocked</th>
            <th className="px-2 py-1.5 font-medium">Stuck</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.userId}
              className="border-b border-border/40 cursor-pointer hover:bg-muted/40"
              onClick={() => onOpenRuns(row.userId)}
            >
              <td className="px-2 py-1.5 max-w-[12rem] truncate" title={row.caller}>
                {row.caller}
                {row.isAdmin ? (
                  <span className="text-muted-foreground"> · admin</span>
                ) : null}
              </td>
              <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">
                {formatEstimatedUsd(row.periodUsd)}
                {row.isAdmin ? (
                  <span className="text-muted-foreground"> · No cap</span>
                ) : (
                  <span className="text-muted-foreground">
                    {' '}
                    / {formatEstimatedUsd(row.allowanceUsd)}
                  </span>
                )}
                {!row.isAdmin && row.overUsd > 0 ? (
                  <span className="text-amber-400">
                    {' '}
                    · over {formatEstimatedUsd(row.overUsd)}
                  </span>
                ) : null}
              </td>
              <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">
                {formatEstimatedUsd(row.allTimeUsd)}
              </td>
              <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">
                {formatEstimatedUsd(row.evalUsd)}
              </td>
              <td className="px-2 py-1.5 tabular-nums">{row.calls}</td>
              <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                {row.mostUsed
                  ? `${row.mostUsed.feature} · ${row.mostUsed.count}`
                  : '—'}
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap">
                {row.lastCall ? (
                  <>
                    {when(row.lastCall.at)} · {row.lastCall.feature}
                    {row.lastCall.eval ? ' · eval' : ''} · {row.lastCall.status}
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td
                className={`px-2 py-1.5 tabular-nums ${
                  row.errors > 0 ? 'text-red-400' : ''
                }`}
              >
                {row.errors}
              </td>
              <td className="px-2 py-1.5 max-w-[14rem] truncate" title={row.lastError ?? ''}>
                {row.lastError ?? '—'}
              </td>
              <td className="px-2 py-1.5 tabular-nums">{row.confirmBlocked}</td>
              <td
                className={`px-2 py-1.5 tabular-nums ${
                  row.stuck > 0 ? 'text-amber-400' : ''
                }`}
              >
                {row.stuck}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
