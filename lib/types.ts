export interface Transaction {
  id: string
  symbol: string
  asset_type: 'stock' | 'crypto'
  action: 'buy' | 'sell'
  quantity: number
  unit_price: number
  executed_at: string
  notes?: string
}

export interface Holding {
  symbol: string
  asset_type: 'stock' | 'crypto'
  quantity: number
  avgCost: number
  totalCost: number
  realizedPnl: number
}

export type EnrichedHolding = Holding & {
  currentPrice: number
  marketValue: number
  unrealizedPnl: number
  unrealizedPnlPercent: number
  change24h: number
  position24hChange: number
}