'use server'

/**
 * Watchlist CRUD. UI and analyst tools share these actions.
 * RLS is the guarantee; user_id is still checked here.
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/user'
import { watchlistSchema } from '@/lib/schemas'
import {
  isWatchableCatalogSymbol,
  openHoldingKey,
  openHoldingKeys,
} from '@/lib/portfolioAnalyst'
import { calculateHoldings } from '@/lib/calculatePortfolio'
import { getUserTransactions } from '@/app/actions/transactions'
import type { WatchlistAssetType, WatchlistItem } from '@/lib/types'

export type WatchlistActionResult<T = WatchlistItem> =
  | { data: T; error?: undefined }
  | { data?: undefined; error: string }

async function loadOpenHoldingKeys(): Promise<Set<string>> {
  const txs = await getUserTransactions()
  return openHoldingKeys(calculateHoldings(txs || []))
}

function asWatchlistItem(row: {
  id: string
  symbol: string
  asset_type: string
  added_at: string
}): WatchlistItem {
  return {
    id: row.id,
    symbol: row.symbol,
    asset_type: row.asset_type as WatchlistAssetType,
    added_at: row.added_at,
  }
}

export async function getWatchlist(): Promise<
  { data: WatchlistItem[]; error?: undefined } | { data?: undefined; error: string }
> {
  const user = await getCurrentUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('watchlist')
    .select('id, symbol, asset_type, added_at')
    .eq('user_id', user.id)
    .order('added_at', { ascending: false })

  if (error) {
    return { error: 'Could not load watchlist' }
  }

  const rows = (data ?? []).map(asWatchlistItem)
  const held = await loadOpenHoldingKeys()
  const stale = rows.filter((row) =>
    held.has(openHoldingKey(row.symbol, row.asset_type))
  )
  if (stale.length > 0) {
    await supabase
      .from('watchlist')
      .delete()
      .eq('user_id', user.id)
      .in(
        'id',
        stale.map((row) => row.id)
      )
    revalidatePath('/dashboard')
  }

  return {
    data: rows.filter(
      (row) => !held.has(openHoldingKey(row.symbol, row.asset_type))
    ),
  }
}

export async function addWatchlistItem(input: {
  symbol: string
  asset_type: WatchlistAssetType
}): Promise<WatchlistActionResult> {
  const parsed = watchlistSchema.safeParse(input)
  if (!parsed.success) {
    const msg = Object.values(parsed.error.flatten().fieldErrors)
      .flat()
      .join(', ')
    return { error: msg || 'Invalid watchlist item' }
  }

  if (!isWatchableCatalogSymbol(parsed.data.symbol, parsed.data.asset_type)) {
    return { error: 'Symbol is not in the catalog for that asset type' }
  }

  const user = await getCurrentUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  const held = await loadOpenHoldingKeys()
  if (held.has(openHoldingKey(parsed.data.symbol, parsed.data.asset_type))) {
    return {
      error: `${parsed.data.symbol} is already in your holdings — watchlist is for symbols you do not own`,
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('watchlist')
    .insert({
      user_id: user.id,
      symbol: parsed.data.symbol,
      asset_type: parsed.data.asset_type,
    })
    .select('id, symbol, asset_type, added_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return {
        error: `${parsed.data.symbol} is already on your watchlist`,
      }
    }
    return { error: 'Could not add to watchlist' }
  }

  revalidatePath('/dashboard')
  return { data: asWatchlistItem(data) }
}

export async function removeWatchlistItem(
  id: string
): Promise<{ error?: string; success?: boolean }> {
  if (!id) {
    return { error: 'Missing watchlist item' }
  }

  const user = await getCurrentUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('watchlist')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle()

  if (!existing || existing.user_id !== user.id) {
    return { error: 'Watchlist item not found' }
  }

  const { error } = await supabase.from('watchlist').delete().eq('id', id)
  if (error) {
    return { error: 'Could not remove from watchlist' }
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function removeWatchlistItemBySymbol(input: {
  symbol: string
  asset_type: WatchlistAssetType
}): Promise<WatchlistActionResult> {
  const parsed = watchlistSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Invalid watchlist item' }
  }

  const user = await getCurrentUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('watchlist')
    .select('id, symbol, asset_type, added_at, user_id')
    .eq('user_id', user.id)
    .eq('symbol', parsed.data.symbol)
    .eq('asset_type', parsed.data.asset_type)
    .maybeSingle()

  if (!existing) {
    return { error: `${parsed.data.symbol} is not on your watchlist` }
  }

  const { error } = await supabase.from('watchlist').delete().eq('id', existing.id)
  if (error) {
    return { error: 'Could not remove from watchlist' }
  }

  revalidatePath('/dashboard')
  return { data: asWatchlistItem(existing) }
}
