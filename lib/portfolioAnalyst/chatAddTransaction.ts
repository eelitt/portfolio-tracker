/**
 * Pure validation for chat-based “add transaction” (prepare → confirm).
 * No I/O. Tools call this before any DB write.
 */

import type { AssetType, SpotAction } from '../types'
import { STOCK_SYMBOLS, ETF_SYMBOLS, CRYPTO_SYMBOLS } from '../symbols'
import type {
  ChatAddTransactionInput,
  CurrencyCode,
  ValidateDraftResult,
  ValidatedTxDraft,
} from './types'

const CASH_SYMBOL = 'Available Cash'

// ---------------------------------------------------------------------------
// Currency (from user text — € / $ / USD / EUR / USDT / USDC)
// ---------------------------------------------------------------------------

const EUR_RE = /(?:€|\beur\b|\beuro\b|\beuros\b)/i
const USD_RE = /(?:\$|\busd\b|\bdollar\b|\bdollars\b)/i
const USDT_RE = /(?:\busdt\b|\btether\b)/i
const USDC_RE = /\busdc\b/i

function markersIn(text: string): CurrencyCode[] {
  const found: CurrencyCode[] = []
  if (EUR_RE.test(text)) found.push('EUR')
  if (USD_RE.test(text)) found.push('USD')
  if (USDT_RE.test(text)) found.push('USDT')
  if (USDC_RE.test(text)) found.push('USDC')
  return found
}

/**
 * Detect an explicit currency in free text.
 * Returns null if none; 'ambiguous' if more than one marker appears.
 * USDT includes the word tether. A ticker next to € or $ is ambiguous here.
 */
export function detectCurrencyFromText(text: string): CurrencyCode | 'ambiguous' | null {
  if (!text || !text.trim()) return null
  const found = markersIn(text)
  if (found.length > 1) return 'ambiguous'
  return found[0] ?? null
}

/**
 * Cash may be USDT or USDC. A stock, ETF, or crypto price still needs € or $.
 * A stable ticker in that sentence is the symbol, not a second currency.
 */
function currencyForDraft(
  text: string,
  cash: boolean
): CurrencyCode | 'ambiguous' | null {
  const found = markersIn(text)
  const relevant = cash ? found : found.filter((code) => code === 'USD' || code === 'EUR')
  if (relevant.length > 1) return 'ambiguous'
  return relevant[0] ?? null
}

// ---------------------------------------------------------------------------
// Catalog symbol resolution
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Validate draft (prepare / confirm)
// ---------------------------------------------------------------------------

function isValidDate(iso: string): boolean {
  return Number.isFinite(Date.parse(iso))
}

function buildSummary(d: ValidatedTxDraft): string {
  if (d.asset_type === 'cash' && (d.currency === 'USDT' || d.currency === 'USDC')) {
    return `${d.action.toUpperCase()} ${d.quantity.toFixed(2)} ${d.currency} cash at ${d.executed_at}`
  }
  const cur = d.currency === 'EUR' ? '€' : '$'
  if (d.asset_type === 'cash') {
    return `${d.action.toUpperCase()} ${cur}${d.quantity.toFixed(2)} cash (${d.currency}) at ${d.executed_at}`
  }
  return `${d.action.toUpperCase()} ${d.quantity} ${d.symbol} @ ${cur}${d.unit_price} (${d.currency}) — ${d.asset_type} — ${d.executed_at}`
}

/**
 * Validate a chat add-transaction draft. Ready drafts are safe to pass to confirm.
 * Currency must appear explicitly in sourceText. Cash may say USDT or USDC.
 * A stock, ETF, or crypto price still needs € or $. No preferred-currency default.
 */
export function validateTransactionDraft(
  input: ChatAddTransactionInput
): ValidateDraftResult {
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
  const action: SpotAction | null = input.action ?? null
  let symbolRaw = input.symbol?.trim() || ''
  const cashDraft =
    assetType === 'cash' || symbolRaw.toLowerCase() === CASH_SYMBOL.toLowerCase()

  // --- Currency (text is authoritative) ---
  const detected = currencyForDraft(sourceText, cashDraft)
  let currency: CurrencyCode | null = null
  if (detected === 'ambiguous') {
    errors.push('Both currencies appear in your text. Use only one currency.')
  } else if (detected) {
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
        'Cash amount needs an explicit currency in your text (€, $, USD, EUR, USDT, or USDC). Preferred currency is not assumed for chat entry.'
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
  } else if (
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
      lower.includes('only one currency') ||
      (lower.includes('is a ') && lower.includes('not '))
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
    const errs = [...errorsUnique]
    if (
      !currency &&
      detected !== 'ambiguous' &&
      !errs.some((e) => e.toLowerCase().includes('currency'))
    ) {
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

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

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
