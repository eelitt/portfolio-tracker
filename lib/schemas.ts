import { z } from 'zod'

/**
 * Zod schema used for validating user input when creating or editing transactions.
 *
 * - Runs on the server inside the Server Actions.
 * - Coerces strings from FormData into numbers. Blank quantity, price, and amount are null.
 * - Symbol is uppercased for consistency.
 * - A future wallet row has null quantity and price. Amount is rejected on every other asset type.
 * - Used by createTransaction and updateTransaction.
 */

const WALLET_ACTIONS = new Set(['funding', 'fee', 'margin_add', 'margin_remove'])

function blankToNull(value: unknown): unknown {
  if (value === '' || value === undefined || value === null) return null
  return value
}

function parseBlankNumber(value: unknown): number | null {
  if (value === '' || value === undefined || value === null) return null
  const n = typeof value === 'number' ? value : Number(value)
  return n
}

const blankNumber = z.preprocess(parseBlankNumber, z.number().nullable())

const blankSide = z.preprocess(
  blankToNull,
  z.enum(['long', 'short']).nullable()
)

function issue(
  ctx: z.RefinementCtx,
  path: string,
  message: string
) {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })
}

export const transactionSchema = z
  .object({
    symbol: z.string().min(1, 'Symbol is required').toUpperCase(),
    asset_type: z.enum(['stock', 'etf', 'crypto', 'cash', 'future']),
    action: z.enum([
      'buy',
      'sell',
      'inflow',
      'outflow',
      'funding',
      'fee',
      'margin_add',
      'margin_remove',
    ]),
    quantity: blankNumber,
    unit_price: blankNumber,
    amount: blankNumber.optional(),
    position_side: blankSide.optional(),
    executed_at: z.string().min(1, 'Date is required'),
    notes: z.string().optional(),
    currency: z.enum(['USD', 'EUR']).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.asset_type !== 'future') {
      if (data.amount != null) {
        issue(ctx, 'amount', 'Amount is only for a future')
      }
      if (data.position_side != null) {
        issue(ctx, 'position_side', 'Position side is only for a future')
      }
      if (data.quantity == null || !(data.quantity > 0)) {
        issue(ctx, 'quantity', 'Quantity must be greater than 0')
      }
      if (data.unit_price == null || !(data.unit_price > 0)) {
        issue(ctx, 'unit_price', 'Price must be greater than 0')
      }
      return
    }

    if (data.position_side == null) {
      issue(ctx, 'position_side', 'Position side is required')
    }

    if (data.action === 'buy' || data.action === 'sell') {
      if (data.quantity == null || !(data.quantity > 0)) {
        issue(ctx, 'quantity', 'Quantity must be greater than 0')
      }
      if (data.unit_price == null || !(data.unit_price > 0)) {
        issue(ctx, 'unit_price', 'Price must be greater than 0')
      }
      if (data.amount != null && !(data.amount > 0)) {
        issue(ctx, 'amount', 'Margin must be greater than 0')
      }
      return
    }

    if (!WALLET_ACTIONS.has(data.action)) {
      issue(ctx, 'action', 'That action is not used on a future')
      return
    }

    if (data.quantity != null) {
      issue(ctx, 'quantity', 'Quantity is empty on a funding, fee, or margin row')
    }
    if (data.unit_price != null) {
      issue(ctx, 'unit_price', 'Price is empty on a funding, fee, or margin row')
    }

    if (data.action === 'fee') {
      if (data.amount == null || !(data.amount < 0)) {
        issue(ctx, 'amount', 'A fee is stored as a negative amount')
      }
      return
    }
    if (data.action === 'funding') {
      if (data.amount == null || data.amount === 0) {
        issue(ctx, 'amount', 'Amount is required')
      }
      return
    }
    if (data.amount == null || !(data.amount > 0)) {
      issue(ctx, 'amount', 'Margin must be greater than 0')
    }
  })
  .transform((data) =>
    data.asset_type === 'future' ? { ...data, currency: 'USD' as const } : data
  )

export type TransactionFormData = z.infer<typeof transactionSchema>

const emptyToNull = (v: unknown) => (v === '' || v === undefined ? null : v)

export const goalSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  target_amount: z.coerce.number().positive('Target must be greater than 0'),
  notes: z.string().optional(),
  is_completed: z.coerce.boolean().default(false),
  target_date: z.preprocess(
    emptyToNull,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
      .nullable()
      .optional()
  ),
  planned_monthly: z.preprocess(
    emptyToNull,
    z.coerce.number().nonnegative('Monthly must be 0 or more').nullable().optional()
  ),
  assigned_amount: z.preprocess(
    emptyToNull,
    z.coerce.number().nonnegative('Assigned amount must be 0 or more').nullable().optional()
  ),
  include_cash: z.preprocess(
    (v) =>
      v === undefined || v === null || v === ''
        ? true
        : v === true || v === 'true',
    z.boolean()
  ),
})

export type GoalFormData = z.infer<typeof goalSchema>

export const investorProfileSchema = z.object({
  ageBand: z.enum(['under_30', '30_45', '45_60', '60_plus']).nullable().optional(),
  horizon: z.enum(['lt_3y', '3_10y', 'gt_10y']).nullable().optional(),
  riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']).nullable().optional(),
  monthlyContribution: z
    .enum(['none', '1_500', '500_1000', '1000_5000', '5000_plus'])
    .nullable()
    .optional(),
})

export type InvestorProfileForm = z.infer<typeof investorProfileSchema>

export const futuresSettingsSchema = z
  .object({
    futuresInPie: z.boolean().optional(),
    futuresInPlan: z.boolean().optional(),
    summaryLabel: z.enum(['total_market_value', 'total_value']).optional(),
  })
  .refine(
    (value) =>
      value.futuresInPie !== undefined ||
      value.futuresInPlan !== undefined ||
      value.summaryLabel !== undefined,
    { message: 'Nothing to save' }
  )

export type FuturesSettingsForm = z.infer<typeof futuresSettingsSchema>

export const allocationPolicySchema = z.object({
  typeWeights: z.object({
    stock: z.coerce.number(),
    etf: z.coerce.number(),
    crypto: z.coerce.number(),
    cash: z.coerce.number(),
  }),
  symbolOverrides: z
    .array(
      z.object({
        symbol: z.string().min(1).toUpperCase(),
        assetType: z.enum(['stock', 'etf', 'crypto']),
        weightPercent: z.coerce.number(),
      })
    )
    .default([]),
  tolerancePp: z.coerce.number().min(0).max(50).default(5),
})

export type AllocationPolicyForm = z.infer<typeof allocationPolicySchema>

export const watchlistSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required').toUpperCase(),
  asset_type: z.enum(['stock', 'etf', 'crypto']),
})

export type WatchlistFormData = z.infer<typeof watchlistSchema>

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
 * Shape stored in user_ai_insights.result for feature_type holding_news.
 * Timestamps are normalized on read (see parseHoldingNewsStored).
 */
export const holdingNewsStoredSchema = z.object({
  news: z.record(z.string(), z.array(z.string())),
  impact: z.record(z.string(), holdingNewsImpactEntrySchema).optional(),
  windowFrom: z.string().optional(),
  windowTo: z.string().optional(),
  contentFetchedAt: z.string().optional(),
  lastCheckedAt: z.string().optional(),
  /** Legacy; prefer contentFetchedAt / lastCheckedAt */
  fetchedAt: z.string().optional(),
})

export type HoldingNewsStored = z.infer<typeof holdingNewsStoredSchema>

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

/**
 * Zod schema for authenticated password change.
 * Used by changePassword Server Action (and client-side pre-checks).
 * Min length matches signup (Supabase default).
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'New passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  })

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>