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
import {
  csvParsedTransactionsSchema,
  type CsvParsedTransactions,
} from '@/lib/schemas'

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
      schema: csvParsedTransactionsSchema,
      system: `You are an expert, precise, and conservative financial CSV transaction parser.
Return ONLY structured data that matches the provided schema exactly.
- Map common exchange columns (Date, Time, Side, Symbol, Amount, Quantity, Price, Total, Notes, etc.) to our fields.
- Convert any date format to YYYY-MM-DD.
- Uppercase all symbols.
- Map actions: BUY/buy/b → buy, SELL/sell/s → sell, DEPOSIT/INFLOW/DEPOSIT → inflow, WITHDRAW/WITHDRAWAL/OUTFLOW → outflow.
- For cash rows use asset_type "cash" and unit_price 1.
- Never invent missing values — prefer to leave notes indicating uncertainty.
- Keep output minimal and accurate.`,
      prompt: `User's preferred display currency is available for context. Parse the following CSV export from an exchange or broker into transactions.

CSV content:
${safeContent}

Return an array of transactions plus any warnings about unmapped columns or ambiguities.`,
      maxTokens: 2000,
    })

    await updateLastAICallTime(user.id)

    return { data: object }
  } catch (e) {
    console.error('AI CSV parse error', e)
    return {
      error:
        'Failed to parse CSV with AI. The file format may be unsupported or the content too complex. You can still add transactions manually.',
    }
  }
}
