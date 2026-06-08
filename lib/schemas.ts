import { z } from 'zod'

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