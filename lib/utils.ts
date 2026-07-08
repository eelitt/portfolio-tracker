import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Human-friendly labels for asset types shown in tables, cards, and modals.
 */
export function getAssetTypeLabel(assetType: string): string {
  const labels: Record<string, string> = {
    stock: 'Stock',
    etf: 'ETF / Index',
    crypto: 'Crypto',
    cash: 'Cash / Savings',
  }
  return labels[assetType] ?? assetType
}
