import { getPortfolioData } from '@/lib/portfolioData'
import { formatCurrency } from '@/lib/currency'
import SensitiveValue from '@/components/SensitiveValue'
import PortfolioValueSync from './PortfolioValueSync'
import SummaryAnalysisPopover from './SummaryAnalysisPopover'

/**
 * Open section (no outer gold card): title + KPI strip on the page field.
 * Portfolio analysis: progressive disclosure via title icon popover.
 */
export default async function SummarySection() {
  const data = await getPortfolioData()

  if (data.error) {
    return <div className="alert-error mb-6">{data.error}</div>
  }

  const showPartialPriceWarning =
    data.assetCount > 0 && data.pricedAssetCount < data.assetCount

  return (
    <section className="mb-8">
      <PortfolioValueSync
        value={data.totalMarketValue}
        currency={data.preferredCurrency}
      />
      <h2 className="section-title mb-4 flex items-center gap-1.5">
        <span className="section-title-accent">Summary</span>
        <SummaryAnalysisPopover />
      </h2>

      {showPartialPriceWarning && (
        <div className="alert-warning mb-4">
          Live prices loaded for{' '}
          <span className="font-medium text-foreground">
            {data.pricedAssetCount}
          </span>{' '}
          of{' '}
          <span className="font-medium text-foreground">{data.assetCount}</span>{' '}
          assets
          {data.unpricedSymbols.length > 0 &&
            data.unpricedSymbols.length <= 8 && (
              <> (missing: {data.unpricedSymbols.join(', ')})</>
            )}
          . Total Market Value and 24h Change exclude missing quotes; cost basis
          still includes all positions. Use Refresh and try again.
        </div>
      )}

      {/* Soft strip — neutral edges, no gold frames per KPI */}
      <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-subtle bg-surface-elevated md:grid-cols-2 lg:grid-cols-4">
        <div className="border-b border-subtle p-4 md:border-r lg:border-b-0">
          <div className="text-sm text-muted-foreground">Total Market Value</div>
          <div className="text-2xl font-semibold tabular-nums">
            <SensitiveValue
              value={formatCurrency(
                data.totalMarketValue,
                data.preferredCurrency,
                1
              )}
            />
          </div>
        </div>

        <div className="border-b border-subtle p-4 lg:border-r lg:border-b-0">
          <div className="text-sm text-muted-foreground">Total Cost Basis</div>
          <div className="text-2xl font-semibold tabular-nums">
            <SensitiveValue
              value={formatCurrency(data.totalCost, data.preferredCurrency, 1)}
            />
          </div>
        </div>

        <div className="border-b border-subtle p-4 md:border-r md:border-b-0 lg:border-b-0">
          <div className="text-sm text-muted-foreground">Unrealized P&amp;L</div>
          <div
            className={`text-2xl font-semibold tabular-nums antialiased ${
              data.totalUnrealizedPnl >= 0
                ? 'text-pnl-positive'
                : 'text-pnl-negative'
            }`}
          >
            <SensitiveValue
              value={formatCurrency(
                data.totalUnrealizedPnl,
                data.preferredCurrency,
                1
              )}
            />
          </div>
        </div>

        <div className="p-4">
          <div className="text-sm text-muted-foreground">24h Change</div>
          {data.totalMarketValue > 0 ? (
            <div
              className={`text-2xl font-semibold tabular-nums antialiased ${
                data.total24hChange >= 0
                  ? 'text-pnl-positive'
                  : 'text-pnl-negative'
              }`}
            >
              <SensitiveValue
                value={formatCurrency(
                  data.total24hChange,
                  data.preferredCurrency,
                  1
                )}
              />
              <span className="ml-1 text-base">
                (
                <SensitiveValue
                  value={`${data.total24hChangePercent.toFixed(2)}%`}
                />
                )
              </span>
            </div>
          ) : (
            <div className="text-2xl font-semibold text-muted-foreground">
              — <span className="text-base">(No price data)</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
