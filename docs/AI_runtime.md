# AI runtime

How the model calls, prompts, and tool registry fit together. Who calls whom is [AI_orchestrator_architecture.md](./AI_orchestrator_architecture.md) and [AI_agent_architecture.md](./AI_agent_architecture.md). Who may invent a number is [architecture.md](./architecture.md).

The judgment in the last two sections is for this app: one private book, figures that must come from code, and a small set of model calls. It is not a claim about every agent stack.

## Call shapes

Every model id is a constant next to the call. Today those constants are `grok-4.3`. Change the constant, not this page.

| Path | API | Tools | What the model receives |
|---|---|---|---|
| Chat orchestrator | `streamText` → `toDataStreamResponse()` | Four `invoke_*` tools | System prompt, user-context block, sanitized chat messages |
| Portfolio Analyst | Nested `generateText` | The sixteen analyst tools | System prompt, optional news block, one constructed user message |
| Portfolio insights, news impact, CSV parse | `generateObject` | None. A Zod schema is the contract | A short system string and one user payload |
| Crypto news search | Raw HTTP, not the AI SDK | Provider tools `web_search` and `x_search` | One combined user message on `/v1/responses` |
| Tax | No model | `estimateFinnishTax` | Nothing |

### Orchestrator stream

`app/api/portfolio-analyst/route.ts`:

- `system`: `ORCHESTRATOR_SYSTEM_PROMPT` plus the string from `formatUserContextForPrompt`. In dry-run, a third block is appended that forbids claims of a save or a live refresh.
- `messages`: `convertToCoreMessages` on the sanitized client thread. System and developer roles are already dropped. The cap is the last 20 user and assistant texts.
- `tools`: `createOrchestratorTools({ userId, parentRunId, lastUserText, dryRun })`.
- `maxSteps`: 6. One user message can call more than one specialist.
- `temperature`: 0.2.
- `maxDuration`: 180.

The browser uses `useChat` against this route. Specialist work is not streamed token by token. The analyst's `generateText` finishes, and that text comes back as a tool result the orchestrator then turns into the streamed answer.

### Analyst generateText

`runPortfolioAnalystAgent` builds one user message, not a replay of the chat thread:

```
Task: <answer | position snapshot | prepare/confirm>
Focus symbols: <optional>
<the real last user message>
```

The task line and the symbol line are hints. Confirm and logging still see `lastUserText` from the sanitizer, which the orchestrator forces as `userMessage`. The model does not get a second system prompt for the task.

`maxSteps` is 5. Temperature is 0.2. The result returned to the orchestrator is the final text plus flags (`transactionSaved`, `watchlistChanged`), not the step stream.

### generateObject

Insights (`generatePortfolioInsights`) and CSV import (`parseCsvWithAI`) call `generateObject` with a Zod schema (`aiInsightsSchema`, `csvAiParseSchema`). The model is asked for an object, not for a tool call. Insights also set temperature 0.2. The CSV call uses the schema's own constraints. News impact is the same shape with `holdingNewsImpactSchema`, temperature 0.2, and `maxTokens` 500. Impact runs only after bullets exist. A failure returns `{}` and the news package still saves.

### Crypto search HTTP

`callXaiResponsesWithSearch` posts to `https://api.x.ai/v1/responses` with `model`, `input` (one user message), and `tools: [{ type: 'web_search' }, { type: 'x_search' }]`. The system prompt and the user prompt are concatenated into that one user message. The responses API plus a separate system role had been returning Cloudflare 520s. The client retries the same call once after one second, then falls back to `/v1/chat/completions` with a normal system and user pair and the same two tools. The date window is in the prompt text. Stock and ETF bullets never take this path. They come from Finnhub.

## Prompt structure

Prompts are the policy the registry cannot express: when to call, what to refuse, and how to phrase the answer. They are not pasted here. The headings below are the sections in source order.

**Orchestrator** (`app/actions/ai/orchestrator/prompt.ts`): role, the four specialists, routing rules, trust boundary, answer style, disclaimers, refusal template. Runtime additions are the user-context block and, when active, the dry-run block. Those are appended in the route, not stored in the prompt constant.

**Analyst** (`app/actions/ai/portfolio-analyst/prompt.ts`): role, trust boundary, in-scope list, out-of-scope list, futures read rules, tool rules, the ten logging steps, watchlist steps, refusal template. `buildAnalystNewsContextBlock` is appended only when the server parsed a news handoff. It is empty otherwise.

**News** (`app/actions/ai/holding-news/prompts.ts`): the crypto search system prompt requires one search per ticker and JSON only. The user prompt is the date window plus the holdings list. The impact system prompt allows tone, outlook, and points, and forbids price targets and buy/sell lines. The impact user prompt is the bullets already collected.

**Insights and CSV:** a short system string (what to judge, what not to invent) and one user payload (a text summary of the book, or the CSV truncated to 50,000 characters).

Routing lines are duplicated on purpose between the orchestrator prompt and the `invoke_*` descriptions from `toolDescription`. Both tell the model which specialist owns tax, news, and logging. A description is what the SDK shows next to the tool. The prompt is what the model sees before it chooses. Numeric meaning (what cash total includes, what `r` is) stays in the tool description and in the code that computes it. Do not copy those sentences into a third prompt.

## Tool registry

`lib/aiTools/registry.ts` is an in-process table. There is no MCP server and no tool process. The comment calls it MCP-flavored because each row has an id, a description, an owner, a side effect, and a failure list. Execute functions stay in the feature file. Zod parameter objects stay there too. The registry does not store parameter schemas.

### What runs

`tool()` from the AI SDK is built like this for every analyst and orchestrator tool:

```
tool({
  description: toolDescription('<id>'),
  parameters: z.object({ ... }),   // owned by the feature file
  execute: async (args) => { ... }  // owned by the feature file
})
```

`toolDescription` throws if the id is missing. That is the check that a factory key and a registry row stay paired.

`getTool` is read by `assertWriteAllowed`. Confirm is refused unless the row has `sideEffect === 'write'` and `requiresConfirmation === true`. `prepare_transaction` is `staging`, so it is not that gate. Watchlist add and remove are `write` with `requiresConfirmation: false`. They must not call `assertWriteAllowed`. The invariant test locks that split: only `confirm_transaction` may be a write that requires confirmation.

`assertRegistryInvariants` also checks that the object key equals `meta.id`. `PORTFOLIO_ANALYST_TOOL_IDS` and `ORCHESTRATOR_TOOL_IDS` are the lists the tests compare to the object keys returned by `createPortfolioAnalystTools` and `createOrchestratorTools`.

`listTools({ owner })` is for those tests and for inspection. The route does not filter the live tool set through it.

### What is only a label

These fields are on `ToolMeta` and are not read when a tool executes:

- `permissions` (`portfolio:read`, `portfolio:write`, `ai:news`, `ai:analysis`, `tax:estimate`)
- `costTier` (`free`, `low`, `medium`, `high`)
- `rateLimitKey` (`chat`, `ai_global_60s`, `news_24h`)

Auth is the route: `getUser()`, `profiles.access_to_app`, and the user-scoped Supabase client inside the tools. Pacing is separate code. Chat uses `portfolio_analyst_rate` (30 messages / 15 minutes, 2 second gap). Insights, impact's parent pipeline, and CSV import share `profiles.last_ai_call_at` (60 seconds). News uses the 24-hour cooldown in `holding-news/constants.ts`. Admins skip the chat cap and the 60-second cooldown. Nothing in `execute` consults `rateLimitKey`.

`failureModes` on the row is the list of codes that tool is allowed to return. The map from code to `recovery` is `lib/aiTools/recovery.ts`, not the registry. `toolFailure` and `withRecovery` attach `recovery` (`retry_same`, `fallback_simpler`, `ask_user`, `abort`) and `retryable`. An unknown code becomes `abort`. The orchestrator prompt tells the model to follow `recovery`. The attachment is server-side. The model does not pick the code.

## Gates around the tools

**Confirm.** `isExplicitConfirmMessage` in `lib/aiTools/confirmGate.ts` is true only when the entire latest user message is a short phrase (`confirm`, `yes`, `log it`, and the small set next to it). A sentence that describes a trade and also says "confirm" does not pass. Warned drafts use `isElevatedConfirmMessage` (`confirm sell`, `confirm trade`, and the small set next to that). Bare `yes` does not satisfy a warning.

`preparedThisRequest` is a flag on one `createAnalystToolCtx`. Prepare sets it. Confirm in that same `generateText` hits `same_turn_as_prepare` and does not insert. Each `invoke_portfolio_analyst` builds a new context, so a second specialist call in the same HTTP request does not see the flag. The exact-phrase rule still blocks confirm when the user message is the trade itself. Confirm of an older draft requires a later message whose whole text is the confirm phrase.

**News handoff.** `newsContextHandoffSchema` in `lib/agents/newsContext.ts` accepts `ok`, holdings, `brief`, `asOf`, and `statusNote`. After a successful news tool, the orchestrator keeps that parsed object. If the analyst tool is called with `newsContext`, the model's object is discarded and the stored one is passed. No successful news call in this request means the analyst tool returns an error instead of trusting the argument.

**Redaction.** Orchestrator tool results go through `redactForStorage` before they return to the model. The same helper truncates `agent_runs` payloads. Strings stop at 500 characters, depth at 4, arrays at 20. Keys `notes`, `sourceText`, `email`, `password`, `token`, and `authorization` are removed. The model does not see the raw draft notes on the way back up.

**Runs.** `startChildAgentRun` and `finishChildAgentRun` write the child row and swallow their own errors. The parent row is the orchestrator `streamText` in the route. Eval starts its own run with `feature` `portfolio_analyst` and does not go through the route.

**Eval.** `lib/agentEval/runSuite.ts` calls `generateText` with the analyst system prompt, the fixture prompt as the only user message, and `createPortfolioAnalystTools` in `evalMode`. Temperature is 0.1. `maxSteps` is 5. The portfolio is the fixture, not the admin's book. Confirm is scored without a stored draft and without an insert. This does not exercise `invoke_news_agent`, `invoke_tax_agent`, or the orchestrator prompt.

## Why this shape

The usual Vercel AI SDK pattern that applies here is a tool loop: `streamText` or `generateText`, tools whose `execute` is your code, Zod parameters, and a step cap. That is what the orchestrator and the analyst are. Wrapping the same loop in `ToolLoopAgent` would not move a figure out of the model or add a gate the registry does not already call. A standalone MCP server would put this single-user app behind another process. The in-process table is the useful part of that idea: one description per tool, and a test that the write flag matches the tool that inserts.

Tax and news stay out of the analyst tool list because their results are an estimate and a set of citations. A tool the analyst can skip, or fill in from memory, is the wrong owner. The tax agent is a function call. The news agent is the same pipeline as the dashboard button, then a `brief` string. The orchestrator only chooses when to run them.

The nested analyst `generateText` is the part that costs a second model call on every numbers question. One model that held the sixteen analyst tools plus news and tax would also hold `prepare_transaction` and `confirm_transaction` in the same prompt as free-form research. The split keeps the write instructions on the specialist that is allowed to log a trade. The extra call is the price of that split, and it is the right trade for this book.

`generateObject` is the standard structured-output call for the jobs that are a form, not a conversation: six insight bullets, a CSV row list, an impact object. CSV rows are reviewed on the import screen and booked by `importTransactions`. The object is not a ledger write.

The raw responses client is the exception. It exists because the SDK tool call for live search was failing on that route, not because a second HTTP style is better in general. New model calls should use `streamText`, `generateText`, or `generateObject` unless that specific provider path breaks again.

## Gaps

These are observations. None of them are scheduled work.

**Orchestrator routing is untested.** The eval suite never sends a prompt through `ORCHESTRATOR_SYSTEM_PROMPT`. A wrong specialist, a skipped news call, or a made-up `newsContext` would not fail a fixture. The useful test is a short suite that stubs the four `invoke_*` executors with fixed briefs and asserts which names ran. Running all four live specialists for every case is a poor default: it is slow, and news and insights write `user_ai_insights` rows.

**The context pack can be quoted as a balance.** `buildUserContext` adds a rounded market-value line (`~N currency MV across K holdings`). The orchestrator is told not to invent figures, and it is also handed a figure before any tool call. A careful answer still comes from `get_portfolio_summary`. The pack should stay routing context: currency, goals, target mix, and whether stored analysis or news exists. The value belongs on the analyst tool.

**Registry labels look like gates.** `permissions`, `costTier`, and `rateLimitKey` do not run. Leave them as documentation on the row until a second caller needs one shared check. A permission framework would duplicate the route auth and the three limiters that already exist.

**The same-turn flag is per specialist call.** `preparedThisRequest` does not span two `invoke_portfolio_analyst` calls in one HTTP request. That is safe while `isExplicitConfirmMessage` requires the whole message to be the confirm phrase. Loosening that matcher, so a long message can count as confirm, would reopen prepare-and-confirm inside one `POST`. If the matcher ever changes, move the flag to the HTTP request.

**Limits are soft.** The chat counter is a read-modify-write of one `user_ai_insights` row. Two tabs can both pass. The same is true of the 60-second timestamp. That is acceptable for a single user's key. An atomic counter is worth writing only if the cap is actually being exceeded.

**Confirm is a later chat message.** `assertWriteAllowed` is a server check on the phrase, the draft, and the same analyst call. It is not a second button that posts to `createTransactionRecord` by itself. The old note that `maxSteps` alone lets the model prepare and confirm in one specialist call is out of date. A dedicated confirm control would be a product change, not a missing gate inside the current chat flow.
