'use client'

/**
 * AllocationPie
 *
 * Renders a donut chart showing portfolio allocation by current market value.
 * Uses Recharts. Falls back to a friendly message when there is no positive
 * market value data (e.g. during price loading failures).
 */

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

interface AllocationPieProps {
  enrichedHoldings: Array<{
    symbol: string
    marketValue: number
  }>
}

export default function AllocationPie({ enrichedHoldings }: AllocationPieProps) {
  const hasPositiveValues = enrichedHoldings.some(h => h.marketValue > 0)

  if (!enrichedHoldings || enrichedHoldings.length === 0 || !hasPositiveValues) {
    return (
      <div className="bg-card border rounded-lg p-6 text-center text-muted-foreground">
        No allocation data available.<br />
        <span className="text-sm">Live prices may be temporarily unavailable.</span>
      </div>
    )
  }

  const data = enrichedHoldings.map((h) => ({
    name: h.symbol,
    value: h.marketValue,
  }))

  const COLORS = ['#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1']

  return (
    <div className="bg-card border rounded-lg p-6 h-80">
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={110}
            dataKey="value"
            label={({ name, percent }) => 
              `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
            }
          >
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={COLORS[index % COLORS.length]} 
              />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Value']} 
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}