/**
 * Pure validation for natural-language transaction drafts (Portfolio Analyst).
 * No I/O. Tools call this before any DB write.
 */

import type { AssetType, TransactionAction } from '../types'
import { STOCK_SYMBOLS, ETF_SYMBOLS, CRYPTO_SYMBOLS } from '../symbols'

export type CurrencyCode = 'USD' | 'EUR'

export type NlDraftInput = {
  /** User wording used for currency / ambiguity checks (required). */
  sourceText: string
  symbol?: string | null
  asset_type?: AssetType | null
  action?: TransactionAction | null
  quantity?: number | null
  unit_price?: number | null
  executed_at?: string | null
  notes?: string | null
  /** Model guess — text detection wins when present. */
  currency?: CurrencyCode | null
}

export type ValidatedTxDraft = {
  symbol: string
  asset_type: AssetType
  action: TransactionAction
  quantity: number
  unit_price: number
  executed_at: string
  notes?: string
  currency: CurrencyCode
  currencySource: 'text'
}

export type ValidateDraftResult = {
  status: 'incomplete' | 'invalid' | 'ready'
  missing: string[]
  errors: string[]
  warnings: string[]
  draft?: ValidatedTxDraft
  summary?: string
}

const CASH_SYMBOL = 'Available Cash'

const EUR_RE = /(?:€|\beur\b|\beuro\b|\beuros\b)/i
const USD_RE = /(?:\$|\busd\b|\bdollar\b|\bdollars\b)/i

/**
 * Detect explicit fiat currency markers in free text.
 * Returns null if none; 'ambiguous' if both euro and dollar markers appear.
 */
export function detectCurrencyFromText(text: string): CurrencyCode | 'ambiguous' | null {
  if (!text || !text.trim()) return null
  const hasEur = EUR_RE.test(text)
  const hasUsd = USD_RE.test(text)
  if (hasEur && hasUsd) return 'ambiguous'
  if (hasEur) return 'EUR'
  if (hasUsd) return 'USD'
  return null
}

function isValidDate(iso: string): boolean {
  return Number.isFinite(Date.parse(iso))
}

/**
 * Resolve a user-provided symbol/name against the app catalog.
 */
export function resolveCatalogSymbol(
  raw: string,
  assetType?: AssetType | null
): { symbol: string; assetType: AssetType } | { error: string } | null {
  const q = raw.trim()
  if (!q) return null

  const upper = q.toUpperCase()
  const lower = q.toLowerCase()

  type Entry = { symbol: string; name: string; assetType: AssetType }
  const pool: Entry[] = []

  const pushStock = () => {
    for (const s of STOCK_SYMBOLS) {
      pool.push({ symbol: s.symbol.toUpperCase(), name: s.name, assetType: 'stock' })
    }
  }
  const pushEtf = () => {
    for (const s of ETF_SYMBOLS) {
      pool.push({ symbol: s.symbol.toUpperCase(), name: s.name, assetType: 'etf' })
    }
  }
  const pushCrypto = () => {
    for (const s of CRYPTO_SYMBOLS) {
      pool.push({ symbol: s.symbol.toUpperCase(), name: s.name, assetType: 'crypto' })
    }
  }

  if (assetType === 'stock') pushStock()
  else if (assetType === 'etf') pushEtf()
  else if (assetType === 'crypto') pushCrypto()
  else if (assetType === 'cash') {
    return { symbol: CASH_SYMBOL, assetType: 'cash' }
  } else {
    pushStock()
    pushEtf()
    pushCrypto()
  }

  const byTicker = pool.filter((e) => e.symbol === upper)
  if (byTicker.length === 1) {
    return { symbol: byTicker[0].symbol, assetType: byTicker[0].assetType }
  }
  if (byTicker.length > 1) {
    if (assetType) {
      const hit = byTicker.find((e) => e.assetType === assetType)
      if (hit) return { symbol: hit.symbol, assetType: hit.assetType }
    }
    return {
      error: `Symbol ${upper} matches multiple asset types. Specify stock, etf, or crypto.`,
    }
  }

  const byNameExact = pool.filter((e) => e.name.toLowerCase() === lower)
  if (byNameExact.length === 1) {
    return { symbol: byNameExact[0].symbol, assetType: byNameExact[0].assetType }
  }
  if (byNameExact.length > 1) {
    return {
      error: `Name "${q}" matches multiple symbols. Use the ticker instead.`,
    }
  }

  return null
}

function buildSummary(d: ValidatedTxDraft): string {
  const cur = d.currency === 'EUR' ? '€' : '$'
  if (d.asset_type === 'cash') {
    return `${d.action.toUpperCase()} ${cur}${d.quantity.toFixed(2)} cash (${d.currency}) at ${d.executed_at}`
  }
  return `${d.action.toUpperCase()} ${d.quantity} ${d.symbol} @ ${cur}${d.unit_price} (${d.currency}) — ${d.asset_type} — ${d.executed_at}`
}

/**
 * Validate a draft from NL + tool args. Ready drafts are safe to pass to confirm.
 * Currency must appear explicitly in sourceText (€/$/USD/EUR/…); no preferred-currency default.
 */
export function validateTransactionDraft(input: NlDraftInput): ValidateDraftResult {
  const missing: string[] = []
  const errors: string[] = []
  const warnings: string[] = []

  const sourceText = (input.sourceText || '').trim()
  if (!sourceText) {
    return {
      status: 'invalid',
      missing: [],
      errors: [
        'sourceText is required so currency (€ or $) can be verified from your words.',
      ],
      warnings: [],
    }
  }

  let assetType: AssetType | null = input.asset_type ?? null
  const action: TransactionAction | null = input.action ?? null
  let symbolRaw = input.symbol?.trim() || ''

  // --- Currency (text is authoritative) ---
  const detected = detectCurrencyFromText(sourceText)
  let currency: CurrencyCode | null = null
  if (detected === 'ambiguous') {
    errors.push(
      'Both euro (€) and dollar ($) markers appear in your text. Use only one currency.'
    )
  } else if (detected === 'USD' || detected === 'EUR') {
    currency = detected
  }

  // --- Cash defaults ---
  if (assetType === 'cash') {
    symbolRaw = CASH_SYMBOL
  }

  // --- Symbol / catalog ---
  if (assetType !== 'cash') {
    if (!symbolRaw) {
      missing.push('symbol')
    } else {
      const resolved = resolveCatalogSymbol(symbolRaw, assetType)
      if (resolved === null) {
        errors.push(
          `Symbol "${symbolRaw}" is not in the app’s catalog. Use a supported ticker (e.g. ETH, AAPL).`
        )
      } else if ('error' in resolved) {
        errors.push(resolved.error)
      } else {
        symbolRaw = resolved.symbol
        if (!assetType) {
          assetType = resolved.assetType
        } else if (assetType !== resolved.assetType) {
          errors.push(
            `Ticker ${resolved.symbol} is a ${resolved.assetType}, not ${assetType}.`
          )
        }
      }
    }
  }

  if (!action) missing.push('action')
  if (!assetType) missing.push('asset_type')

  // --- Quantity / price ---
  const quantity = input.quantity
  const unitPrice = input.unit_price

  if (quantity === undefined || quantity === null || Number.isNaN(Number(quantity))) {
    missing.push('quantity')
  } else if (!(Number(quantity) > 0)) {
    errors.push('Quantity must be greater than 0.')
  }

  if (assetType === 'cash') {
    if (!currency && detected !== 'ambiguous') {
      missing.push('currency')
      errors.push(
        'Cash amount needs an explicit currency in your text (€, $, USD, or EUR). Preferred currency is not assumed for chat entry.'
      )
    }
  } else if (assetType) {
    if (unitPrice === undefined || unitPrice === null || Number.isNaN(Number(unitPrice))) {
      missing.push('unit_price')
    } else if (!(Number(unitPrice) > 0)) {
      errors.push('Unit price must be greater than 0.')
    }
    if (!currency && detected !== 'ambiguous') {
      missing.push('currency')
      errors.push(
        'Price needs an explicit currency in your text (€, $, USD, or EUR). Example: "$3180" or "€3180". Preferred currency is not assumed for chat entry.'
      )
    }
  } else {
    // asset type still unknown — still require currency once price present
    if (
      unitPrice !== undefined &&
      unitPrice !== null &&
      !currency &&
      detected !== 'ambiguous'
    ) {
      missing.push('currency')
      errors.push(
        'Price needs an explicit currency in your text (€, $, USD, or EUR). Example: "$3180" or "€3180".'
      )
    }
  }

  // --- Action vs asset type ---
  if (action && assetType) {
    if (assetType === 'cash' && (action === 'buy' || action === 'sell')) {
      errors.push('Cash uses inflow/outflow, not buy/sell.')
    }
    if (assetType !== 'cash' && (action === 'inflow' || action === 'outflow')) {
      errors.push('Assets use buy/sell, not inflow/outflow.')
    }
  }

  // --- Date ---
  let executedAt = input.executed_at?.trim() || ''
  if (!executedAt) {
    executedAt = new Date().toISOString()
    warnings.push('Date was missing — assumed now. Say if you want a different date.')
  } else if (!isValidDate(executedAt)) {
    errors.push(`Invalid date: "${input.executed_at}". Use an ISO date/time.`)
  }

  const missingUnique = [...new Set(missing)]
  const errorsUnique = [...new Set(errors)]

  // Hard invalid: catalog, action mismatch, bad numbers, bad date, ambiguous currency
  const hardErrors = errorsUnique.filter((e) => {
    const lower = e.toLowerCase()
    return (
      lower.includes('catalog') ||
      lower.includes('multiple') ||
      lower.includes('inflow/outflow') ||
      lower.includes('buy/sell') ||
      lower.includes('greater than 0') ||
      lower.includes('invalid date') ||
      lower.includes('both euro') ||
      lower.includes('is a ') && lower.includes('not ')
    )
  })

  if (hardErrors.length > 0) {
    return {
      status: 'invalid',
      missing: missingUnique,
      errors: errorsUnique,
      warnings,
    }
  }

  if (missingUnique.length > 0 || !currency) {
    // Ensure currency message is visible when only currency is the issue
    const errs = [...errorsUnique]
    if (!currency && detected !== 'ambiguous' && !errs.some((e) => e.toLowerCase().includes('currency'))) {
      errs.push(
        'Include € or $ (or USD/EUR) for the amount. Preferred currency is not assumed for chat entry.'
      )
      if (!missingUnique.includes('currency')) missingUnique.push('currency')
    }
    return {
      status: 'incomplete',
      missing: [...new Set(missingUnique)],
      errors: [...new Set(errs)],
      warnings,
    }
  }

  const qty = Number(quantity)
  const price = assetType === 'cash' ? 1 : Number(unitPrice)

  const draft: ValidatedTxDraft = {
    symbol: assetType === 'cash' ? CASH_SYMBOL : symbolRaw.toUpperCase(),
    asset_type: assetType!,
    action: action!,
    quantity: assetType === 'cash' ? Number(qty.toFixed(2)) : qty,
    unit_price: price,
    executed_at: new Date(executedAt).toISOString(),
    notes: input.notes?.trim() || undefined,
    currency: currency!,
    currencySource: 'text',
  }

  return {
    status: 'ready',
    missing: [],
    errors: [],
    warnings,
    draft,
    summary: buildSummary(draft),
  }
}

/** Optional warning when sell qty exceeds current holding. */
export function sellExceedsHoldingWarning(
  draft: ValidatedTxDraft,
  heldQty: number | null | undefined
): string | null {
  if (draft.action !== 'sell' || draft.asset_type === 'cash') return null
  if (heldQty === null || heldQty === undefined) return null
  if (draft.quantity > heldQty) {
    return `Sell quantity (${draft.quantity}) is greater than current holding (${heldQty}). The app will cap oversells in holdings math, but the logged sell still uses your stated quantity.`
  }
  return null
}
