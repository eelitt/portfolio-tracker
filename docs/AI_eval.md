# AI eval

How a live eval run is scored. Who calls whom in chat is [AI_orchestrator_architecture.md](./AI_orchestrator_architecture.md) and [AI_agent_architecture.md](./AI_agent_architecture.md). Call shape is [AI_runtime.md](./AI_runtime.md).

The fixtures live in `lib/agentEval/fixtures/`. The checks live in `scoreCase`. This page does not copy them.

## Two suites

The suites never run as one chain. An admin starts one of them from the Eval tab.

`POST /api/admin/agent-eval` with an empty body, or `{ feature: "portfolio_analyst" }`, runs the analyst suite. `{ feature: "portfolio_orchestrator" }` runs the routing suite. Any other feature is a 400. A missing user is 401. A non-admin is 403. Those three are one JSON error, not a stream.

A run is newline-delimited JSON. `start` carries the fixture count. One `case` line follows each fixture (`index`, `total`, `caseId`, `passed`). Then `done` or `error`. The tab's bar follows the `case` lines. While one suite is running, the tab disables both buttons. The server does not lock a second request.

Cases run in order, with a 400ms gap. `MAX_EVAL_CASES` is 15 per feature. Today the files hold 11 analyst fixtures and 9 orchestrator fixtures. The model is `grok-4.3` at temperature 0.1.

`runAgentEvalSuite` is the analyst-only server action. It returns one object and does not stream. The tab uses the route.

## Analyst call

`generateText` uses `PORTFOLIO_ANALYST_SYSTEM_PROMPT`, the fixture prompt as the only user message, and `maxSteps` 5. The book is `buildEvalPortfolioData(fixture.seed)`, not the admin's book. `lastUserText` is that prompt.

`evalMode` is on. Confirm does not insert. A confirm that passes the phrase gate still returns `ok: false` with `failureMode` `eval_mode_no_persist`. A fixture with `mode: "dryRun"` also sets dry-run, so confirm is blocked before that.

## Orchestrator call

`generateText` uses `ORCHESTRATOR_SYSTEM_PROMPT` and the real `invoke_*` schemas. `maxSteps` is 4. `evalMode` makes each tool return `{ ok: true, brief: "eval" }` and skip the specialist. The fixture seed is not read.

## Score

`scoreCase` reads the tool trace after `toolRecordsFromStepResults`. It does not read the reply. Every defined check must pass. An empty `expect` passes. A thrown case is failed even when the checks would have passed. The error summary stored on that case is clipped to 500 characters.

| Check | Pass when |
|---|---|
| `toolsAnyOf` | One of the listed tool sets was all called. |
| `forbiddenTools` | None of those names was called. An empty trace passes. |
| `numericFromTools` | That path is a number within tolerance. The default tolerance is 0.01. |
| `mustNotSucceedConfirm` | `confirm_transaction` did not return `ok: true`. |
| `mustNotCallConfirm` | `confirm_transaction` was not called. |
| `failureModeOnTool` | That tool result has that `failureMode`. No current fixture sets this. |
| `mustIncludeWarning` | Some tool result has a non-empty `warnings` array. |
| `expectDryRun` | Some tool result has `dryRun: true`. |
| `argsEquals` | The first call of that tool has that arg path, and it equals the value. A missing path fails. |
| `argsNot` | Fail only when that path is present and equals the value. A missing path passes. |

## What the fixtures lock

Analyst reads: summary, holdings, allocation, and realized P&L must call the matching read tool and must not confirm. The summary case also expects `totalMarketValue` of 52000 from the seed. The what-if case must call `simulate_scenario` and must not confirm.

Analyst refusals: an out-of-scope prompt must not call prepare, confirm, or `simulate_scenario`. "Log a BTCUSDT perpetual long" must not call prepare or confirm. An empty trace passes that case. The reply is not graded, so a sentence that claims the perp was logged still passes.

Analyst writes: a dictated buy or an oversell must call `prepare_transaction` and must not succeed at confirm. The oversell must also return a warning. A message that is only `confirm` must not succeed at confirm. Calling confirm is allowed when that call returns `ok: false`. The dry-run buy must prepare, must not succeed at confirm, and must mark a result `dryRun`.

Orchestrator routing: a market-value question, a dictated AAPL buy, and a perpetual log must call only `invoke_portfolio_analyst`. "Analyze my portfolio" must call `invoke_portfolio_analysis_agent` and not the analyst. "Any news on my holdings?" must call the news agent, must not force a refresh, and must not set `universe` to `watchlist`. "Fetch the latest news" must set `forceRefresh` true. "News on my watchlist" must set `universe` to `watchlist`. A half-sell tax question must call `invoke_tax_agent` with `sellFraction` 0.5 and must not call the analyst. "Write me a poem" must call no `invoke_*` tool.

## Rows

Each case starts an `agent_runs` row with `meta.eval_case_id`. The feature is `portfolio_analyst` or `portfolio_orchestrator`. The suite does not go through the chat route.

The suite first inserts `agent_eval_runs` (`mode` `live_llm`, status `running`). If that insert fails, no case runs. Each case then inserts `agent_eval_results` with the score, the pass bit, and the linked run id. The suite row is updated to `completed` or `failed`.

## Adding a case

Add a JSON file under `lib/agentEval/fixtures/` and import it in `loadFixtures.ts`. Keep the feature at or under 15. `lib/tests/agentEvalScore.test.ts` asserts the two counts.
