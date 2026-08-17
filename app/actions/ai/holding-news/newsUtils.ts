/**
 * Public barrel for holding-news helpers (not a Server Action).
 * Callers keep importing from this path.
 */

export {
  HOLDING_NEWS_COOLDOWN_MS,
  HOLDING_NEWS_EXTENDED_LOOKBACK_DAYS,
  HOLDING_NEWS_FEATURE_TYPE,
  HOLDING_NEWS_MAX_HOLDINGS,
  HOLDING_NEWS_MAX_LOOKBACK_DAYS,
  WATCHLIST_NEWS_FEATURE_TYPE,
  buildNextRefreshAt,
  newsFeatureType,
  type CachedInsight,
  type HoldingNewsSuccessResult,
} from './constants'
export { parseHoldingNewsStored, toCooldownResult } from './parseStored'
export {
  buildHoldingNewsMergeMessage,
  hasUncoveredHoldings,
  isUncoveredSymbol,
  mergeHoldingNews,
  newsHasAnyBullets,
  symbolHasBullets,
  symbolNewsFingerprint,
  symbolsEligibleForExtendedLookback,
  type HoldingNewsMergeResult,
} from './mergeNews'
export { computeNewsWindow, computeNewsWindowDays } from './newsWindow'
export {
  resolveAssetName,
  resolveNewsHoldings,
  resolveNewsTargets,
  selectHoldingsForNews,
  type NewsTarget,
  type NewsUniverse,
} from './newsTargets'
export {
  normalizeHoldingNews,
  parseHoldingNewsJson,
  resolveNewsKeyToSymbol,
} from './parseModelNews'
export { buildNewsBrief, type NewsBriefHolding } from './newsBrief'
