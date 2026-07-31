'use client'

import type { FinnishTaxEstimateResult } from '@/lib/tax'

function eur(n: number) {
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(n)
}

function MethodCard({
  title,
  method,
}: {
  title: string
  method: FinnishTaxEstimateResult['methods']['fifo']
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        <p className="text-lg font-semibold tabular-nums">{eur(method.estimatedTaxEur)}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <dt>Taxable base</dt>
        <dd className="text-right tabular-nums text-foreground">{eur(method.taxableBaseEur)}</dd>
        <dt>Net gain / loss</dt>
        <dd className="text-right tabular-nums text-foreground">{eur(method.netGainOrLossEur)}</dd>
        <dt>Proceeds</dt>
        <dd className="text-right tabular-nums text-foreground">{eur(method.totalProceedsEur)}</dd>
        <dt>HMO used</dt>
        <dd className="text-right text-foreground">{method.usedHmoOnAnyDisposal ? 'Yes' : 'No'}</dd>
      </dl>
      {method.disposals.length > 0 && (
        <ul className="mt-2 space-y-1.5 border-t pt-2 text-xs">
          {method.disposals.map((d) => (
            <li key={`${method.method}-${d.disposalEventId}`} className="space-y-0.5">
              <div className="flex justify-between gap-2 font-medium">
                <span>
                  {d.assetKey}
                  {d.isHypothetical ? ' (what-if)' : ''} × {d.quantity}
                </span>
                <span className="tabular-nums">{eur(d.taxableGainOrLossEur)}</span>
              </div>
              <p className="text-muted-foreground">
                Basis: {d.basisUsed}
                {d.basisUsed === 'hmo' ? ` (${(d.hmoRate * 100).toFixed(0)}%)` : ''} · cost{' '}
                {eur(d.actualCostEur)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {method.notes.map((n) => (
        <p key={n} className="text-xs text-muted-foreground">
          {n}
        </p>
      ))}
    </div>
  )
}

export default function TaxEstimateResult({ result }: { result: FinnishTaxEstimateResult }) {
  const cheaperLabel =
    result.comparison.cheaperMethod === 'tie'
      ? 'Both methods same tax'
      : result.comparison.cheaperMethod === 'fifo'
        ? 'Lower tax: FIFO'
        : 'Lower tax: weighted average'

  const noDisposals =
    result.methods.fifo.disposals.length === 0 &&
    result.methods.weightedAverage.disposals.length === 0

  return (
    <div className="space-y-4">
      {noDisposals && (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-3">
          No disposals in scope for tax year {result.taxYear}. Record sells or run a what-if sell to
          see an estimate.
        </p>
      )}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <p className="text-xs font-medium text-muted-foreground">Comparison</p>
        <p className="text-sm font-semibold">{cheaperLabel}</p>
        {result.comparison.taxDeltaEur > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Delta {eur(result.comparison.taxDeltaEur)} · rates {result.ratesYearLabel}
          </p>
        )}
        {result.comparison.notes.map((n) => (
          <p key={n} className="text-xs text-muted-foreground mt-1">
            {n}
          </p>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MethodCard title="FIFO" method={result.methods.fifo} />
        <MethodCard title="Weighted average" method={result.methods.weightedAverage} />
      </div>

      <div className="text-xs space-y-1 text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Small disposals: </span>
          {result.smallDisposal.note}
        </p>
        {result.yearEndNotes.length > 0 && (
          <div className="pt-1">
            <p className="font-medium text-foreground mb-0.5">Year-end notes</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {result.yearEndNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="pt-1">
          <p className="font-medium text-foreground mb-0.5">Assumptions</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {result.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
        <div className="pt-2 border-t space-y-0.5">
          {result.disclaimers.map((d) => (
            <p key={d}>{d}</p>
          ))}
        </div>
      </div>
    </div>
  )
}
