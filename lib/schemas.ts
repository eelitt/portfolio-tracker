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
  asset_type: z.enum(['stock', 'crypto']),
  action: z.enum(['buy', 'sell']),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  unit_price: z.coerce.number().positive('Price must be greater than 0'),
  executed_at: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
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
 * Used by generateAIInsights for reliable, parseable results.
 */
export const aiInsightsSchema = z.object({
  insights: z.array(z.string()).max(6),
})

export type AIInsights = z.infer<typeof aiInsightsSchema>