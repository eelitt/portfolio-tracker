/** Monthly rate from a nominal annual rate. */
export function monthlyRate(annualRate: number): number {
  if (!Number.isFinite(annualRate)) return 0
  return annualRate / 12
}

/**
 * Future value: current PV grown monthly + ordinary annuity (contribution at month end).
 * i = 0 → PV + PMT × n.
 */
export function projectValue(input: {
  pv: number
  pmt: number
  annualRate: number
  months: number
}): number {
  const pv = Number(input.pv) || 0
  const pmt = Number(input.pmt) || 0
  const n = Math.max(0, Math.floor(input.months))
  if (n === 0) return pv
  const i = monthlyRate(input.annualRate)
  if (Math.abs(i) < 1e-15) return pv + pmt * n
  const growth = Math.pow(1 + i, n)
  return pv * growth + pmt * ((growth - 1) / i)
}

/**
 * PMT so FV at `months` equals `target`. Already funded (PV ≥ target, or growth alone ≥ target) → 0.
 */
export function requiredMonthly(input: {
  pv: number
  target: number
  annualRate: number
  months: number
}): number {
  const pv = Number(input.pv) || 0
  const target = Number(input.target) || 0
  if (!(target > pv)) return 0
  const n = Math.max(0, Math.floor(input.months))
  if (n === 0) return target - pv
  const i = monthlyRate(input.annualRate)
  if (Math.abs(i) < 1e-15) return (target - pv) / n
  const growth = Math.pow(1 + i, n)
  const fvOfPv = pv * growth
  if (fvOfPv >= target) return 0
  const pmt = ((target - fvOfPv) * i) / (growth - 1)
  return Number.isFinite(pmt) && pmt > 0 ? pmt : 0
}

/**
 * Months to reach `target` at this PMT. `null` = never.
 */
export function monthsToTarget(input: {
  pv: number
  target: number
  pmt: number
  annualRate: number
}): number | null {
  const pv = Number(input.pv) || 0
  const target = Number(input.target) || 0
  const pmt = Number(input.pmt) || 0
  if (!(target > pv)) return 0
  const i = monthlyRate(input.annualRate)
  if (Math.abs(i) < 1e-15) {
    if (!(pmt > 0)) return null
    return Math.ceil((target - pv) / pmt)
  }
  if (!(pmt > 0) && i <= 0) return null
  if (!(pmt > 0) && i > 0) {
    if (!(pv > 0)) return null
    const n = Math.log(target / pv) / Math.log(1 + i)
    if (!Number.isFinite(n) || n < 0) return null
    return Math.ceil(n)
  }
  const pmtOverI = pmt / i
  const denom = pv + pmtOverI
  const numer = target + pmtOverI
  if (!(denom > 0) || !(numer / denom > 0)) return null
  const n = Math.log(numer / denom) / Math.log(1 + i)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.ceil(n)
}

/** Whole calendar months from UTC today to `yyyy-mm-dd` (0 if today or past). */
export function monthsUntil(targetDate: string, now = new Date()): number {
  const [y, m, d] = targetDate.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return 0
  const ty = y
  const tm = m - 1
  const ny = now.getUTCFullYear()
  const nm = now.getUTCMonth()
  const nd = now.getUTCDate()
  let months = (ty - ny) * 12 + (tm - nm)
  if (d < nd) months -= 1
  return Math.max(0, months)
}
