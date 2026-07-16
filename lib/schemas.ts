import { z } from 'zod'

/**
 * Zod schema used for validating user input when creating or editing transactions.
 *
 * - Runs on the server inside the Server Actions.
 * - Coerces strings from FormData into numbers.
 * - Symbol is uppercased for consistency.
 * - Used by createTransaction and updateTransaction.
 */
export const transactionSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required').toUpperCase(),
  asset_type: z.enum(['stock', 'etf', 'crypto', 'cash']),
  action: z.enum(['buy', 'sell', 'inflow', 'outflow']),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  unit_price: z.coerce.number().positive('Price must be greater than 0'),
  executed_at: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
  currency: z.enum(['USD', 'EUR']).optional(),
})

export type TransactionFormData = z.infer<typeof transactionSchema>

export const goalSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  target_amount: z.coerce.number().positive('Target must be greater than 0'),
  notes: z.string().optional(),
  is_completed: z.coerce.boolean().default(false),
})

export type GoalFormData = z.infer<typeof goalSchema>

/**
 * Zod schema for structured AI output (used with generateObject).
 * 
 * Forces the model to return a clean array of bullet points (max 6).
 * Used by generatePortfolioInsights for reliable, parseable results.
 */
export const aiInsightsSchema = z.object({
  insights: z.array(z.string()).max(6),
})

export type AIInsights = z.infer<typeof aiInsightsSchema>

/**
 * Zod schema for Holding News feature.
 *
 * AI returns news collectively (one call) but structured per-symbol.
 * Max 3 short bullets per holding (cost + “main points only”).
 */
export const holdingNewsSchema = z.object({
  news: z.record(
    z.string(), // symbol e.g. "AAPL", "LINK"
    z.array(z.string()).max(3)
  ),
})

export type HoldingNews = z.infer<typeof holdingNewsSchema>

/** Tone label for news impact analysis (required enum, no free text). */
export const newsImpactToneSchema = z.enum([
  'positive',
  'neutral',
  'negative',
  'mixed',
])

export type NewsImpactTone = z.infer<typeof newsImpactToneSchema>

/**
 * Per-holding impact analysis derived from fetched news (no live tools).
 * tone + outlook + up to 3 points.
 */
export const holdingNewsImpactEntrySchema = z.object({
  tone: newsImpactToneSchema,
  outlook: z.string(),
  points: z.array(z.string()).max(3),
})

export const holdingNewsImpactSchema = z.object({
  impact: z.record(z.string(), holdingNewsImpactEntrySchema),
})

export type HoldingNewsImpactEntry = z.infer<typeof holdingNewsImpactEntrySchema>
export type HoldingNewsImpact = z.infer<typeof holdingNewsImpactSchema>

/**
 * Zod schema for AI-powered CSV import parsing.
 *
 * Used with generateObject for structured, reliable output from the LLM.
 * The client enforces a hard 200-row limit *before* calling the AI
 * (cost protection). This schema provides server-side defense-in-depth.
 */
export const csvParsedTransactionsSchema = z.object({
  transactions: z.array(transactionSchema).max(200, 'CSV may contain at most 200 transactions'),
  warnings: z.array(z.string()).optional(),
})

export type CsvParsedTransactions = z.infer<typeof csvParsedTransactionsSchema>