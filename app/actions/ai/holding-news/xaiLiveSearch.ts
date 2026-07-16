/**
 * Live search via xAI (web_search + x_search).
 * Prefer Responses API (docs default for server tools); fall back to chat completions.
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

  // Date range is enforced in the prompt; keep tool defs minimal (origin 520s seen with extra fields).
  const tools = [{ type: 'web_search' }, { type: 'x_search' }] as const
  // Docs examples use a single user message; system role has been flaky on /responses + tools.
  const combinedUser = `${params.system}\n\n${params.prompt}`

  const attempts: Array<() => Promise<string>> = [
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
    // Retry Responses once (Cloudflare 520 is often transient origin blip).
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
    // Fallback: chat completions + tools (supported for built-in web/x search).
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

function extractResponsesText(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const root = data as Record<string, unknown>

  if (typeof root.output_text === 'string' && root.output_text.trim()) {
    return root.output_text
  }

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
