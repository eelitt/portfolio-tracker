/**
 * Curated symbol lists for transaction form dropdowns (+ crypto id map).
 *
 * - Users can only pick symbols that exist in these lists for the chosen asset type.
 * - To support a new instrument, add it to the appropriate .json file.
 * - Crypto entries include the CoinGecko "id" so held cryptos can be priced.
 *
 * Price APIs are never called for the full lists. The price service only looks up
 * CoinGecko ids (getCryptoId) for symbols already in the user's holdings.
 */

import stocksJson from './symbols/stocks.json' with { type: 'json' };
import etfsJson from './symbols/etfs.json' with { type: 'json' };
import cryptosJson from './symbols/cryptos.json' with { type: 'json' };

export interface AssetSymbol {
  symbol: string;
  name: string;
}

export interface CryptoSymbol {
  id: string;
  symbol: string;
  name: string;
  market_cap_rank?: number;
}

export const STOCK_SYMBOLS: AssetSymbol[] = stocksJson as AssetSymbol[];
export const ETF_SYMBOLS: AssetSymbol[] = etfsJson as AssetSymbol[];
export const CRYPTO_SYMBOLS: CryptoSymbol[] = cryptosJson as CryptoSymbol[];

/**
 * Returns the list of {symbol, name} for a given asset type.
 * Used by the UI dropdown to populate options.
 */
export function getSymbolsForType(
  assetType: 'stock' | 'etf' | 'crypto' | 'cash' | string
): AssetSymbol[] {
  switch (assetType) {
    case 'stock':
      return STOCK_SYMBOLS;
    case 'etf':
      return ETF_SYMBOLS;
    case 'crypto':
      // For crypto we expose ticker + name (the id is internal for pricing).
      return CRYPTO_SYMBOLS.map((c) => ({ symbol: c.symbol, name: c.name }));
    default:
      return [];
  }
}

/**
 * Returns the CoinGecko id for a crypto ticker (case-insensitive).
 * Returns undefined for unknown tickers (price fetch will then return null).
 */
export function getCryptoId(ticker: string): string | undefined {
  const upper = ticker.toUpperCase();
  const found = CRYPTO_SYMBOLS.find((c) => c.symbol.toUpperCase() === upper);
  return found?.id;
}

/**
 * Builds option objects for a <select>.
 * If preserveValue is supplied and not already present in the list for this type,
 * it is prepended so that editing an old transaction whose symbol was removed
 * from the json still works.
 */
export function getSymbolOptions(
  assetType: 'stock' | 'etf' | 'crypto' | 'cash' | string,
  preserveValue?: string
): Array<{ value: string; label: string }> {
  if (assetType === 'cash') {
    return [];
  }

  const base = getSymbolsForType(assetType);
  const options = base.map((entry) => ({
    value: entry.symbol,
    label: `${entry.symbol} — ${entry.name}`,
  }));

  if (preserveValue) {
    const upper = preserveValue.toUpperCase();
    const alreadyPresent = options.some(
      (o) => o.value.toUpperCase() === upper
    );
    if (!alreadyPresent) {
      options.unshift({
        value: preserveValue,
        label: `${preserveValue} (previous)`,
      });
    }
  }

  return options;
}
