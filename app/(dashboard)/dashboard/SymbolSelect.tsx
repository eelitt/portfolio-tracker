'use client'

import { useMemo } from 'react'
import { getSymbolOptions } from '@/lib/symbols'

interface SymbolSelectProps {
  assetType: 'stock' | 'etf' | 'crypto' | 'cash' | string
  value: string
  onChange: (symbol: string) => void
  className?: string
  /** When editing, pass the original symbol so it remains selectable even if
   *  it is no longer present in the current json for this asset type. */
  preserveSymbolForEdit?: string
  required?: boolean
}

/**
 * Controlled symbol field.
 *
 * - For stock / etf / crypto: renders a <select> populated from the curated
 *   lists in lib/symbols/*.json. Labels are "TICKER — Name".
 * - For cash: renders a plain text <input> (user provides their own label,
 *   e.g. "Emergency Fund").
 *
 * The preserveSymbolForEdit prop ensures we don't break editing of older
 * transactions whose symbol may have been removed from the json.
 */
export default function SymbolSelect({
  assetType,
  value,
  onChange,
  className = 'border p-2 rounded',
  preserveSymbolForEdit,
  required = true,
}: SymbolSelectProps) {
  const options = useMemo(
    () => getSymbolOptions(assetType, preserveSymbolForEdit),
    [assetType, preserveSymbolForEdit]
  )

  if (assetType === 'cash') {
    return (
      <input
        name="symbol"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        placeholder="Cash label (e.g. Savings or USD)"
        required={required}
      />
    )
  }

  return (
    <select
      name="symbol"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      required={required}
    >
      <option value="">Select symbol…</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}
