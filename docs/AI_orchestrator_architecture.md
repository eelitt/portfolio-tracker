# Orchestrator

The chat assistant is one private surface over this user's book. The orchestrator decides which specialist to call, then writes the answer from what those specialists returned.

It routes. Holdings, tax, and news are computed in the specialists and in the same engines the screens use. Who may invent a number is [architecture.md](./architecture.md). What a money figure means is [calculation_logic.md](./calculation_logic.md). How each specialist is built is [AI_agent_architecture.md](./AI_agent_architecture.md). Prompt shape, the registry, and the call path are [AI_runtime.md](./AI_runtime.md).

## Why it exists

A single model with every tool could mix a made-up headline, a made-up balance, and a write. The split keeps those jobs apart:

- Language and routing stay in the orchestrator.
- Portfolio figures stay in the Portfolio Analyst, which calls pure code.
- News stays in the News Agent, which returns a stored or freshly fetched package.
- Finnish capital-gains estimates stay in the Tax Agent, which calls `lib/tax/`.
- Risk and concentration narrative stays in the Portfolio Analysis Agent.

The orchestrator has no portfolio-math tools. Its only tools are the four `invoke_*` calls in `app/actions/ai/orchestrator/tools.ts`.

## Where it runs

The browser chat is `useChat` in `app/(app)/ai-insights/ai-insights/PortfolioAnalystView.tsx`. It posts to `POST /api/portfolio-analyst`. The path name is the old analyst route, kept so the client did not change when routing moved up a level. The handler is the orchestrator.

The model id is the `MODEL_ID` constant in `app/api/portfolio-analyst/route.ts` (currently `grok-4.3`). The call is Vercel AI SDK `streamText` against `@ai-sdk/xai`. Temperature is 0.2. `maxSteps` is 6, so one user message can call more than one specialist. `maxDuration` is 180 seconds because news plus an analyst pass can outlast a short function limit.

`XAI_API_KEY` must be set. If it is missing the route returns 503 and the README leaves the assistant off.

## One turn

```
POST /api/portfolio-analyst
  session user                         401 if missing
  profiles.access_to_app               403 if not true
  XAI_API_KEY                          503 if unset
  sanitizeAnalystMessages              drop system/developer; cap size
  resolveDryRun                        body.dryRun or the user text
  checkAndConsumeAnalystRateLimit      also on dry-run
  startAgentRun                        parent row, feature portfolio_orchestrator
  buildUserContext                     appended to the system prompt
  streamText
       invoke_news_agent
       invoke_portfolio_analyst
       invoke_tax_agent
       invoke_portfolio_analysis_agent
  onFinish (finishReason !== error)    persist rolling chat text
  finishAgentRun / onError             parent row success, partial, or error
```

Auth uses `supabase.auth.getUser()` and the same `access_to_app` flag as the rest of the app. The AI stack is not a second data plane. Specialists use the user-scoped Supabase client. See the isolation thesis in [architecture.md](./architecture.md).

### Message sanitizer

`app/actions/ai/portfolio-analyst/sanitizeMessages.ts` runs before `convertToCoreMessages`. It drops system and developer roles, keeps the last 20 user and assistant text messages, and caps field size and total size. The last user text is what later gates use for confirm and dry-run. User text is untrusted. The system prompt tells the model to ignore jailbreaks and persona switches. The sanitizer is the code check. The prompt is the instruction.

### Dry-run

`resolveDryRun` in `lib/aiTools/dryRun.ts` is true when the body sets `dryRun: true`, or when the last user text matches a dry-run phrase (`dry run` / `dry-run`) or "what would you do". The route appends a dry-run block to the system prompt and passes `dryRun` into every specialist.

In that mode the news tool forces `forceRefresh` off, and the analyst and analysis tools must not report a saved transaction, a watchlist write, a regenerated analysis, or a live news refresh. The answer describes what a real turn would do.

### Chat rate limit

`checkAndConsumeAnalystRateLimit` is separate from the global 60-second `profiles.last_ai_call_at` cooldown used by CSV import and portfolio insights. Chat state lives in `user_ai_insights` with `feature_type = portfolio_analyst_rate`: 30 messages in a rolling 15 minutes, and at least 2 seconds between messages. Admins skip it. Dry-run still consumes a slot because the outer model call still costs money. The limit is once per HTTP request, not once per specialist step.

### User context pack

`buildUserContext` in `lib/aiTools/buildUserContext.ts` builds a short trusted block for the system prompt:

- Preferred currency.
- A one-line market value, holding count, and top symbols, from `getPortfolioData`.
- Investor profile bits already on `profiles` (age band, horizon, risk, contribution band).
- Saved asset-type target weights, if a policy exists.
- Up to five goals.
- The last stored portfolio-analysis bullets (up to six).
- When the last holding-news package was stored, and for how many symbols.

The pack does not include the chat thread. The POST already sends messages. It does not include watchlist news. It is a hint so the model can route. Figures the user is meant to trust still come from specialist tools on that turn.

### Parent run

`startAgentRun` writes a parent `agent_runs` row before streaming. `onStepFinish` records each `invoke_*` result. `onFinish` stores token usage, duration, step count, and the invoked tool names. A stream error finishes the row as `error`. Recording is best-effort and must not fail the user's answer. Child rows are started inside each specialist (`lib/agents/runChildAgent.ts`).

## Routing

The system prompt in `app/actions/ai/orchestrator/prompt.ts` is the routing policy. The tools enforce the trust checks below. Intended routes:

| User is asking for | Call |
|---|---|
| Holdings, P&L, allocation, scenarios, "how much do I own" | Portfolio Analyst |
| Risks, concentration, structure, "analyze my portfolio" | Portfolio Analysis Agent |
| Headlines on holdings | News Agent, `universe` omitted |
| Headlines on the watchlist | News Agent, `universe=watchlist` |
| An explicit fetch / refresh / "get latest" | News Agent with `forceRefresh: true` |
| A casual "any news?" | News Agent with `forceRefresh` omitted |
| News plus position size or P&L | News Agent first, then Portfolio Analyst with `newsContext` |
| Finnish capital-gains tax, including "tax if I sell half" | Tax Agent (`sellFraction` when the user gave a fraction) |
| Tax and what the book would look like afterward | Tax Agent and Portfolio Analyst, in parallel when the two questions are independent |
| "I bought", "I sold", "log", "confirm", "yes" | Portfolio Analyst, with the user's exact message |
| Watchlist list, add, or remove | Portfolio Analyst |

A simple question should call one specialist. Off-topic requests are refused, with the short list of things the assistants can do.

The prompt also sets answer style: lead with the specialist `brief` or summary, include `statusNote` when the tool sent one, and follow a tool's `recovery` (`ask_user`, `fallback_simpler`, `abort`). Recovery codes live in `lib/aiTools/recovery.ts`. The orchestrator does not invent a cooldown, a tax figure, or a headline to fill a gap.

Disclaimers stay narrow. News-only answers skip the portfolio-figures line. Tax answers use the brief's own "estimate only" line. A figures disclaimer is for turns that actually reported calculated portfolio numbers. A successful log confirmation does not get one.

## Trust checks in the tool layer

`createOrchestratorTools` binds the request's `userId`, parent run id, last user text, and dry-run flag. The model cannot swap the user.

**News handoff.** A successful `invoke_news_agent` that returned holdings is parsed with `parseNewsContextHandoff` and kept on the server for this request only. If the analyst tool is called with `newsContext`, that payload is discarded. The analyst receives the server copy. If news has not succeeded in this request, the analyst call returns an error telling the model to call the news agent first or to omit `newsContext`. The analyst may cite those bullets. It may not invent headlines.

**Analyst grounding.** Logging and confirm use `lastUserText` from the sanitizer. The model's optional `userMessage` is not the string the confirm gate sees. Task (`answer`, `position_snapshot`, `prepare_trade`) and symbol focus are hints. The specialist still answers the real user message.

**Dry-run flags on the way out.** News `packageUpdated` is forced false. Analyst `transactionSaved` and `watchlistChanged` are forced false. Analysis `packageUpdated` is forced false. Each payload can carry `dryRun: true`.

**Redaction.** Specialist results pass through `redactForStorage` before they return to the model, so secrets in tool payloads are not echoed into the prompt or the run log.

**What the model still must not do.** Report a number, a headline, or a tax amount that no tool returned. Mention cache internals. Lecture about a cooldown unless `statusNote` is present or the user asked when the data was last updated. Claim a write during dry-run.

## Chat history

One rolling thread per user is stored in `user_ai_insights` (`feature_type = portfolio_analyst_chat`) by `persistAnalystChatTurn`. The blob keeps the last 20 user and assistant text messages, the same cap as the sanitizer. Tool payloads are not stored. The sidebar hydrates on open. New chat clears the blob. A finish reason of `error` skips the write, so a failed stream does not append a partial assistant turn.

Pending transaction drafts are a different row (`portfolio_analyst_pending_tx`, 30-minute TTL). The prepare → confirm gate is specified in the Chat section of [architecture.md](./architecture.md). The orchestrator does not implement that gate. The Portfolio Analyst does, inside `confirm_transaction`.
