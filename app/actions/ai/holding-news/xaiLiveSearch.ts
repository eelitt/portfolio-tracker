/**
 * xAI live search client for Holding News (web_search + x_search).
 *
 * Not a server action — pure HTTP helper used by generateHoldingNews.
 * Avoids depending on a newer @ai-sdk/xai tools API; posts directly to xAI.
 *
 * Strategy (in order):
 *  1. POST /v1/responses with tools (preferred; agentic server-side search)
 *  2. Retry same call after 1s (Cloudflare 520s are often transient)
 *  3. Fall back to /v1/chat/completions with the same tools
 *
 * Date range: passed in for API symmetry; enforced mainly in the prompt text.
 * Tool objects stay minimal — extra tool fields previously correlated with origin 520s.
 */

/**
 * Run live search and return the model’s final text (expected JSON news map).
 * Throws if every attempt fails (caller maps to user-facing error).
 */
export async function callXaiResponsesWithSearch(params: {
  system: string
  prompt: string
  fromDate: string
  toDate: string
}): Promise<string> {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    throw new Error('XAI_API_KEY missing')
  }

  // Built-in server tools; xAI executes search, model returns grounded answer text
  const tools = [{ type: 'web_search' }, { type: 'x_search' }] as const

  // /responses + tools has been flaky with a separate system role; merge into one user message
  const combinedUser = `${params.system}\n\n${params.prompt}`

  const attempts: Array<() => Promise<string>> = [
    // Primary: Responses API (docs default for agentic tools)
    () =>
      postXaiJson(
        apiKey,
        'https://api.x.ai/v1/responses',
        {
          model: 'grok-4.3',
          input: [{ role: 'user', content: combinedUser }],
          tools: [...tools],
        },
        extractResponsesText
      ),
    // Retry once — 520 HTML pages often clear after a short pause
    async () => {
      await sleep(1000)
      return postXaiJson(
        apiKey,
        'https://api.x.ai/v1/responses',
        {
          model: 'grok-4.3',
          input: [{ role: 'user', content: combinedUser }],
          tools: [...tools],
        },
        extractResponsesText
      )
    },
    // Fallback: chat completions still accept web_search / x_search on grok-4.x
    () =>
      postXaiJson(
        apiKey,
        'https://api.x.ai/v1/chat/completions',
        {
          model: 'grok-4.3',
          messages: [
            { role: 'system', content: params.system },
            { role: 'user', content: params.prompt },
          ],
          tools: [...tools],
        },
        extractChatCompletionText
      ),
  ]

  let lastError: unknown
  for (const attempt of attempts) {
    try {
      return await attempt()
    } catch (e) {
      lastError = e
      console.error('xAI live-search attempt failed', e)
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Live news search failed')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Shared POST + text extraction. Non-2xx or empty body → throw with short log snippet.
 */
async function postXaiJson(
  apiKey: string,
  url: string,
  body: Record<string, unknown>,
  extractText: (data: unknown) => string
): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    // Cloudflare/xAI errors are often HTML; log a short flat snippet only
    const errBody = await res.text().catch(() => '')
    const snippet = errBody.replace(/\s+/g, ' ').slice(0, 280)
    console.error('xAI request error', url, res.status, snippet)
    throw new Error(`xAI request failed (${res.status})`)
  }

  const data = await res.json()
  const text = extractText(data)
  if (!text) {
    console.error('xAI empty text payload', url, JSON.stringify(data).slice(0, 1500))
    throw new Error('Empty response from xAI')
  }
  return text
}

/**
 * Extract assistant text from Chat Completions-style payloads.
 * content may be a string or an array of text parts after tool rounds.
 */
function extractChatCompletionText(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const root = data as Record<string, unknown>
  const choices = root.choices
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') {
    return ''
  }
  const msg = (choices[0] as Record<string, unknown>).message
  if (!msg || typeof msg !== 'object') return ''
  const content = (msg as Record<string, unknown>).content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
          return (part as Record<string, unknown>).text as string
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

/**
 * Extract final text from Responses API payloads.
 * Tries output_text, then output[] message parts, then chat-like choices fallback.
 */
function extractResponsesText(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const root = data as Record<string, unknown>

  // Convenience field when present
  if (typeof root.output_text === 'string' && root.output_text.trim()) {
    return root.output_text
  }

  // Structured output items (message content parts)
  if (Array.isArray(root.output)) {
    const chunks: string[] = []
    for (const item of root.output) {
      if (!item || typeof item !== 'object') continue
      const entry = item as Record<string, unknown>
      if (entry.type === 'message' && Array.isArray(entry.content)) {
        for (const part of entry.content) {
          if (!part || typeof part !== 'object') continue
          const p = part as Record<string, unknown>
          if (typeof p.text === 'string') chunks.push(p.text)
        }
      }
      if (typeof entry.text === 'string') chunks.push(entry.text)
    }
    if (chunks.length) return chunks.join('\n')
  }

  // Some gateways still nest chat-completions shape under the same JSON
  const choices = root.choices
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
    const msg = (choices[0] as Record<string, unknown>).message
    if (msg && typeof msg === 'object') {
      const content = (msg as Record<string, unknown>).content
      if (typeof content === 'string') return content
    }
  }

  return ''
}
