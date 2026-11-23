# AI recovery

What a failure returns, and what happens next. Who calls whom is [AI_orchestrator_architecture.md](./AI_orchestrator_architecture.md) and [AI_agent_architecture.md](./AI_agent_architecture.md). Call shape and the registry are [AI_runtime.md](./AI_runtime.md).

The code list is `lib/aiTools/recovery.ts`. This page does not copy it.

## Envelope

Analyst tools that fail return `ok: false`, `error`, `failureMode`, `recovery`, and `retryable`. `toolFailure` and `withRecovery` attach the last two. The model does not pick the code.

An unknown `failureMode` becomes `abort` and is not retryable. `retryable` is true only for `provider_unavailable` and `empty_response`. Nothing in `execute` loops on that flag.

## What reaches the orchestrator

`invoke_news_agent`, `invoke_portfolio_analyst`, and `invoke_tax_agent` return `ok`, an error string, and `brief` or `text`. They do not attach `recovery`. A tax failure is that error string. The tax tool does not send `estimate_failed`.

Only `invoke_portfolio_analysis_agent` forwards `failureMode` and `recovery`. It maps the insights error text: a wait or rate message is `rate_limited`, auth and config and an empty book use those codes, and anything else is `estimate_failed`.

If the analyst tool is called with `newsContext` and this request has no successful news call, the tool returns `ok: false` and an error string. It does not trust the model's object.

## What the model is told

The orchestrator prompt names three strategies. `ask_user` means ask for the missing piece. `fallback_simpler` means present the content the tool returned. `abort` means explain briefly and stop. Do not invent a number, a headline, or a tax figure.

The prompt does not mention `retry_same`. The analyst sees the envelope on its own tool results. If the model ignores `recovery`, the server still refuses the write.

| Strategy | Meaning here | Examples that execute today |
|---|---|---|
| `retry_same` | The envelope says the same call may be tried again. The server does not retry it. | None. The two mapped codes are not returned. |
| `fallback_simpler` | Do not start another expensive call. Use what this result already has. | `rate_limited`. A dry-run with no stored analysis is `dry_run_no_live_analysis` on an `ok: true` result. |
| `ask_user` | The tool needs a different user message. It is not retryable. | `no_explicit_confirm`, `elevated_confirm_required`, `same_turn_as_prepare`, `no_pending_draft`, validation codes, catalog codes, `watchlist_not_requested`. |
| `abort` | Stop. Do not fill the gap. | `not_configured`, `not_authenticated`, `empty_portfolio`, `portfolio_load_failed`, `insert_failed`, `estimate_failed`, `watchlist_load_failed`. |

## Codes that do not match the map

`profile_incomplete`, `no_goals`, and `goal_not_found` are returned by tools. They are not in the map, so they abort.

`provider_unavailable`, `empty_response`, `cooldown_store_hit`, and `hash_short_circuit` are in the map, and tests cover the first and the third. Current execute paths do not return them.

`draft_store_failed`, `no_holdings`, `specialist_error`, and `write_blocked_in_child` are labels on the registry row. No execute path returns them.

## Degraded success

These paths succeed with thinner content. They are not failure envelopes.

News inside the 24-hour window returns the stored package. The agent path does not add a cooldown sentence. The dashboard path can.

An unchanged portfolio hash returns the stored analysis and a short unchanged message. No model call runs.

A 60-second hit that still has a stored analysis returns that package and a wait message. With no stored package, the call is an error, and the analysis agent marks it `rate_limited`.

News impact is optional. If that `generateObject` fails, the result is `{}` and the news package still saves.

Crypto search posts to `/v1/responses`, retries that call once after one second, then uses `/v1/chat/completions` with the same two search tools. If every attempt throws, holding news returns an error string and the news agent finishes `ok: false`.

## Stops outside the envelope

The chat route returns 429 from `checkAndConsumeAnalystRateLimit` before `streamText`. The 60-second slot is the conditional update inside insights, news, and CSV import. Admins skip both.

Confirm still requires the phrase, the stored draft, and a later message. Watchlist add and remove still require the command shape. Those checks are server-side. Dry-run does not persist a write. Eval mode returns a stub from each `invoke_*` tool and does not run a specialist. Analyst eval does not insert a trade.

## Recording

A thrown specialist finishes its child row with status `error` and `errorSummary`. The analyst catch does not add `policy_signals`. The route `onError` stores an empty reply.

`startAgentRun` and `finishAgentRun` log and swallow their own errors. A start failure returns no id. A finish failure leaves the row unfinished. A missing row is possible.
