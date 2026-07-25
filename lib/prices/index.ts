/**
 * Live portfolio quotes (point-in-time marks for holdings).
 *
 * Chart history (OHLC, sync, markers) lives in lib/priceHistory.
 */

export {
  getStockPrice,
  getCryptoPrice,
  getCryptoPricesBatch,
  getPricesForHoldings,
  type PriceQuote,
  type PriceFetchOptions,
} from './service'

export { binanceBaseUrl } from './binanceBase'
export {
  buildBinance24hrUrl,
  parseBinance24hrTickers,
  type BinanceTickerQuote,
} from './binanceTicker'
