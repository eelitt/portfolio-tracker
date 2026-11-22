import { tool } from 'ai'
import { z } from 'zod'
import { resolveWatchlistQuery } from '@/lib/portfolioAnalyst'
import {
  addWatchlistItem,
  getWatchlist,
  removeWatchlistItemBySymbol,
} from '@/app/actions/watchlist'
import {
  toolDescription,
  withRecovery,
  toolFailure,
  dryRunNote,
  watchlistCommandSpan,
  watchlistSpanAllowsSymbol,
  watchlistFollowUpOpen,
  watchlistBareTarget,
  type PhraseHit,
  type WatchlistMutation,
} from '@/lib/aiTools'
import type { AnalystToolCtx } from './toolContext'

function watchlistTurnCanWrite(
  lastUserText: string,
  priorUserText: string,
  kind: WatchlistMutation
): boolean {
  if (watchlistCommandSpan(lastUserText, kind) != null) return true
  const prior = watchlistCommandSpan(priorUserText, kind)
  return prior != null && watchlistFollowUpOpen(prior, phraseHit)
}

function phraseHit(phrase: string): PhraseHit {
  const result = resolveWatchlistQuery(phrase)
  if (result.ok) return { kind: 'unique', symbol: result.symbol }
  if (result.failureMode === 'catalog_ambiguous') return { kind: 'ambiguous' }
  return { kind: 'none' }
}

function watchlistWriteAllowed(
  lastUserText: string,
  priorUserText: string,
  kind: WatchlistMutation,
  query: string,
  symbol: string,
  name: string
) {
  const parts = { query, symbol, name }
  const span = watchlistCommandSpan(lastUserText, kind)
  if (span != null) {
    if (watchlistSpanAllowsSymbol(span, symbol, phraseHit)) return null
    return toolFailure(
      'watchlist_not_requested',
      'Name the symbol in this message (for example "add AAPL to my watchlist").'
    )
  }
  const prior = watchlistCommandSpan(priorUserText, kind)
  if (
    prior != null &&
    watchlistFollowUpOpen(prior, phraseHit) &&
    watchlistBareTarget(lastUserText, parts)
  ) {
    return null
  }
  return toolFailure(
    'watchlist_not_requested',
    'This message is not a watchlist change. Say "add … to my watchlist" or "remove … from my watchlist".'
  )
}

export function createWatchlistTools(ctx: AnalystToolCtx) {
  const { evalMode, noPersist } = ctx

  return {
    list_watchlist: tool({
      description: toolDescription('list_watchlist'),
      parameters: z.object({}),
      execute: async () => {
        if (evalMode) {
          return { ok: true as const, count: 0, items: [], evalMode: true }
        }
        const result = await getWatchlist()
        if (result.error || !result.data) {
          return toolFailure(
            'watchlist_load_failed',
            result.error || 'Could not load watchlist'
          )
        }
        return {
          ok: true as const,
          count: result.data.length,
          items: result.data.map((row) => ({
            symbol: row.symbol,
            assetType: row.asset_type,
            addedAt: row.added_at,
          })),
        }
      },
    }),

    add_watchlist_item: tool({
      description: toolDescription('add_watchlist_item'),
      parameters: z.object({
        query: z
          .string()
          .describe('User’s symbol or name (e.g. apple, BNB, AAPL)'),
      }),
      execute: async (args) => {
        if (!watchlistTurnCanWrite(ctx.lastUserText, ctx.priorUserText, 'add')) {
          return toolFailure(
            'watchlist_not_requested',
            'This message is not a watchlist change. Say "add … to my watchlist" or "remove … from my watchlist".'
          )
        }

        const resolved = resolveWatchlistQuery(args.query)
        if (!resolved.ok) {
          return withRecovery({
            ok: false as const,
            error: resolved.error,
            failureMode: resolved.failureMode,
            candidates: resolved.candidates,
          })
        }

        const allowed = watchlistWriteAllowed(
          ctx.lastUserText,
          ctx.priorUserText,
          'add',
          args.query,
          resolved.symbol,
          resolved.name
        )
        if (allowed) return allowed

        const label = `${resolved.symbol} (${resolved.name}, ${resolved.assetType})`
        if (noPersist) {
          return {
            ok: true as const,
            symbol: resolved.symbol,
            assetType: resolved.assetType,
            name: resolved.name,
            ...dryRunNote(`add_watchlist_item ${label}`),
          }
        }

        const saved = await addWatchlistItem({
          symbol: resolved.symbol,
          asset_type: resolved.assetType,
        })
        if (saved.error || !saved.data) {
          const duplicate = /already on your watchlist/i.test(saved.error || '')
          const held = /already in your holdings/i.test(saved.error || '')
          return toolFailure(
            held
              ? 'watchlist_held'
              : duplicate
                ? 'watchlist_duplicate'
                : 'insert_failed',
            saved.error || 'Could not add to watchlist'
          )
        }

        return {
          ok: true as const,
          symbol: saved.data.symbol,
          assetType: saved.data.asset_type,
          name: resolved.name,
          note: `Added ${label} to the watchlist.`,
        }
      },
    }),

    remove_watchlist_item: tool({
      description: toolDescription('remove_watchlist_item'),
      parameters: z.object({
        query: z
          .string()
          .describe('User’s symbol or name to remove from the watchlist'),
      }),
      execute: async (args) => {
        if (!watchlistTurnCanWrite(ctx.lastUserText, ctx.priorUserText, 'remove')) {
          return toolFailure(
            'watchlist_not_requested',
            'This message is not a watchlist change. Say "add … to my watchlist" or "remove … from my watchlist".'
          )
        }

        const resolved = resolveWatchlistQuery(args.query)
        if (!resolved.ok) {
          return withRecovery({
            ok: false as const,
            error: resolved.error,
            failureMode: resolved.failureMode,
            candidates: resolved.candidates,
          })
        }

        const allowed = watchlistWriteAllowed(
          ctx.lastUserText,
          ctx.priorUserText,
          'remove',
          args.query,
          resolved.symbol,
          resolved.name
        )
        if (allowed) return allowed

        const label = `${resolved.symbol} (${resolved.name}, ${resolved.assetType})`
        if (noPersist) {
          return {
            ok: true as const,
            symbol: resolved.symbol,
            assetType: resolved.assetType,
            name: resolved.name,
            ...dryRunNote(`remove_watchlist_item ${label}`),
          }
        }

        const removed = await removeWatchlistItemBySymbol({
          symbol: resolved.symbol,
          asset_type: resolved.assetType,
        })
        if (removed.error || !removed.data) {
          const missing = /not on your watchlist/i.test(removed.error || '')
          return toolFailure(
            missing ? 'watchlist_not_found' : 'insert_failed',
            removed.error || 'Could not remove from watchlist'
          )
        }

        return {
          ok: true as const,
          symbol: removed.data.symbol,
          assetType: removed.data.asset_type,
          name: resolved.name,
          note: `Removed ${label} from the watchlist.`,
        }
      },
    }),
  }
}
