'use server'

/**
 * Parses a CSV using the AI model as the parser.
 *
 * Client MUST perform the 200-row count BEFORE calling this (cost protection).
 * Server applies rate limiting and defensive checks.
 * Persistence of reviewed rows is importTransactions in transactions.ts.
 */

import { getCurrentUser, isCurrentUserAdmin } from '@/lib/user'
import {
  getLastAICallTime,
  updateLastAICallTime,
} from '@/app/actions/ai/storage'
import { normalizeCsvImport } from '@/lib/csvImport'
import { csvAiParseSchema, type CsvParsedTransactions } from '@/lib/schemas'

export async function parseCsvWithAI(
  csvContent: string
): Promise<{ data?: CsvParsedTransactions; error?: string }> {
  const user = await getCurrentUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  if (!process.env.XAI_API_KEY) {
    return { error: 'AI service is not configured.' }
  }

  // Basic defensive row count (primary gate is on the client)
  const rowCount = csvContent.split('\n').filter(Boolean).length - 1
  if (rowCount > 200) {
    return {
      error:
        'CSV contains more than 200 rows. Please split the file and import in batches.',
    }
  }

  if (!csvContent || csvContent.trim().length < 10) {
    return { error: 'The selected file appears to be empty or invalid.' }
  }

  // Rate limit (same 60s cooldown as other AI features; admins skip for testing)
  if (!(await isCurrentUserAdmin())) {
    const lastCall = await getLastAICallTime(user.id)
    if (lastCall) {
      const secondsSince = (Date.now() - lastCall.getTime()) / 1000
      if (secondsSince < 60) {
        const wait = Math.ceil(60 - secondsSince)
        return { error: `Please wait ${wait} seconds before using AI import again.` }
      }
    }
  }

  // Truncate just in case (client should have already capped)
  const safeContent = csvContent.slice(0, 50000)

  try {
    const { generateObject } = await import('ai')
    const { xai } = await import('@ai-sdk/xai')

    const { object } = await generateObject({
      model: xai('grok-4.3'),
      schema: csvAiParseSchema,
      system: `You are a precise financial CSV parser. Return only data that matches the schema.
- Keep a clock time on executed_at. A date-only value stays YYYY-MM-DD.
- Uppercase symbols. Map a USD-M symbol such as BTCUSDT to the catalog coin BTC. Leave an unknown symbol as written, including a 1000-unit name such as 1000PEPE.
- asset_type is stock, etf, crypto, cash, or future. A perpetual fill, funding payment, fee, or margin change is future. Spot crypto stays crypto.
- A future row needs position_side long or short. Buy opens or adds a long, or reduces a short. Sell opens or adds a short, or reduces a long.
- quantity and unit_price are base size and fill price. Leave both empty on funding, fee, margin_add, and margin_remove.
- amount is USD collateral only when the file states that position's margin. Funding is a signed amount. A fee is a negative amount. Never put notional, a Total column, or the exchange realized-profit column into amount or into realized_pnl's place as margin. Leave amount empty when margin is not stated.
- Put a fee charged on a fill in fee. Do not also emit a second fee row.
- A later explicit margin change is margin_add or margin_remove. A transfer between the spot wallet and the futures wallet is skip wallet_transfer, not margin.
- A liquidation row is skip liquidation. An inverse contract is skip inverse. An option is skip option.
- Do not invent prices, sizes, or margin. Cash rows use asset_type cash, action inflow or outflow, and unit_price 1.
- Warnings name unmapped columns. Realized profit is not a transaction.`,
      prompt: `Parse the following CSV export from an exchange or broker into transactions.

CSV content:
${safeContent}`,
      maxTokens: 2000,
    })

    await updateLastAICallTime(user.id)

    return { data: normalizeCsvImport(object) }
  } catch (e) {
    console.error('AI CSV parse error', e)
    return {
      error:
        'Failed to parse CSV with AI. The file format may be unsupported or the content too complex. You can still add transactions manually.',
    }
  }
}
