/**
 * LLM prompt templates for Holding News (live search + impact).
 * Pure string builders — no I/O.
 */

/**
 * System prompt for live web + X news fetch.
 * Used for **crypto** holdings only (stocks/ETFs use Finnhub company-news).
 */
export function buildHoldingNewsSystemPrompt(): string {
  return `You are a financial news assistant with live web and X search tools for cryptocurrency holdings.
For EACH holding listed, you MUST run a separate search for that holding before writing its array.
Rules:
- Search every ticker individually. Do not skip a ticker because another holding already has news.
- Prefer reputable web sources; use X for official project posts and major announcements.
- Max 3 short bullet points per holding (one sentence each).
- Be factual. Do not invent events.
- Keys MUST be the exact ticker symbols provided (uppercase tickers only). Never use project names as JSON keys.
- Respond with ONLY valid JSON matching this shape (no markdown fences, no extra text):
{"news":{"SYMBOL":["bullet1","bullet2"]}}

Search focus (crypto): Use token ticker + project name. Prioritize protocol upgrades, listings, hacks, regulation of that project, major partnership announcements.`
}

/** User prompt for live news: date window + holdings list. */
export function buildHoldingNewsUserPrompt(args: {
  fromDate: string
  toDate: string
  lookbackDays: number
  holdingsSummary: string
}): string {
  return `Date range (inclusive): ${args.fromDate} to ${args.toDate} (last ${args.lookbackDays} day(s)).

Holdings to cover (search EACH line separately):
${args.holdingsSummary}

For every ticker above, search material news in this window. Return JSON with a "news" object keyed by those exact tickers. Use an empty array for a ticker only after you searched that ticker and found nothing material.`
}

/** System prompt for post-news impact analysis (no live tools). */
export function buildImpactSystemPrompt(): string {
  return `You analyze portfolio holding news for rough near-term implications.
For each holding, return:
- tone: exactly one of positive | neutral | negative | mixed
- outlook: one short sentence (rough forward read, not a prediction)
- points: 2–3 short bullets on mechanisms / what to watch (do not restate headlines verbatim)

Rules:
- Base conclusions only on the provided news bullets. Do not invent events.
- Qualitative only: no price targets, no % forecasts, no buy/sell/hold recommendations.
- If implications are unclear, use tone "neutral" and a cautious outlook.
- Keys MUST be the exact uppercase tickers provided.
- Not financial advice — stay measured.`
}

/** User prompt: preformatted holdings + news block. */
export function buildImpactUserPrompt(holdingsBlock: string): string {
  return `Analyze impact for these holdings and their news:

${holdingsBlock}

Return JSON: { "impact": { "SYMBOL": { "tone", "outlook", "points" } } }`
}
