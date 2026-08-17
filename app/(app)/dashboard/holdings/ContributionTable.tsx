'use client'

import { formatCurrency } from '@/lib/currency'
import type { PreferredCurrency } from '@/lib/userTypes'
import type { ContributionRow } from '@/lib/benchmarks'
import SensitiveValue from '@/components/SensitiveValue'

export default function ContributionTable({
  rows,
  preferredCurrency,
}: {
  rows: ContributionRow[]
  preferredCurrency: PreferredCurrency
}) {
  if (rows.length === 0) return null

  return (
    <div className="mt-5">
      <h3 className="mb-1 text-xs font-medium text-foreground">
        Contribution in range
      </h3>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Change in market value, not time-weighted return. Cash in/out counts.
      </p>
      <div className="overflow-hidden rounded-lg border border-subtle">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-subtle bg-muted/30 text-left text-muted-foreground">
              <th className="px-2.5 py-1.5 font-medium">Position</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Δ value</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-subtle last:border-0">
                <td className="px-2.5 py-1.5 font-medium">{r.label}</td>
                <td
                  className={`px-2.5 py-1.5 text-right tabular-nums ${
                    r.delta >= 0 ? 'text-pnl-positive' : 'text-pnl-negative'
                  }`}
                >
                  <SensitiveValue
                    value={formatCurrency(r.delta, preferredCurrency, 1)}
                  />
                </td>
                <td className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">
                  {r.sharePercent == null
                    ? '—'
                    : `${r.sharePercent.toFixed(0)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
