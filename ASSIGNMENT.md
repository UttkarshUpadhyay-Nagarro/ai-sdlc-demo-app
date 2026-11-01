# AI in SDLC: home assignment write-up

**Author:** Uttkarsh Upadhyay (3185560)
**Feature:** approval limits by role on the invoice approval service
**Branch / PR:** `feature/approval-limits-by-role` -> `main` on my fork of `NITIN1670/ai-sdlc-demo-app`: https://github.com/UttkarshUpadhyay-Nagarro/ai-sdlc-demo-app/pull/1
**Demo video (8-10 min):** https://drive.google.com/drive/folders/1rwOgXVZTIkIa5Tl_C34EZnVofk0me6GN?usp=sharing

## 1. What was built

| Rule | Behaviour | Where |
| --- | --- | --- |
| R1 | Manager approves up to 50,000.00 (inclusive) | `ApprovalService.Decide` |
| R2 | Director approves up to 500,000.00 (inclusive) | `ApprovalService.Decide` |
| R3 | Above 500,000.00: two distinct approvers; the second must be a Director | `ApprovalService.Decide` + `FirstApprovedBy/At` on `Invoice` |
| R4 | The same user never counts as both approvers (trimmed, case-insensitive) | `ApprovalService.IsSameUser` |
| R5 | A refused attempt returns a clear reason (HTTP 403 `{ error }`) and changes nothing | decide-then-apply split, `ApprovalDeniedException`, `ApiControllerBase.Handle` |

Demo accounts (password `ChangeMe123!`, not real credentials): `demo.manager`, `demo.director`, `demo.director2`, `demo.admin`.

## 2. Tooling choice

The brief suggests GitHub Copilot's free tier and allows alternatives that meet compliance. I used **Claude Code** (Anthropic) as the agent because it supports project-level sub-agents, skills and hooks natively, which steps 2, 3, 8 and 9 of the brief ask for. The repo stays vendor-neutral:

- `AGENTS.md` is the single source of agent instructions. `CLAUDE.md` imports it, and `.github/copilot-instructions.md` points Copilot to it.
- OpenSpec was initialised for both Claude Code (`.claude/commands/opsx`, `.claude/skills/openspec-*`) and Copilot (`.github/prompts`, `.github/skills`).

## 3. How each step of the brief was done

### Step 1: context that earns its place (`AGENTS.md`)
`AGENTS.md` now covers:
- the rules R1-R5 as a table, with inclusive limits, `decimal`, the exact refusal reasons, and "validate first, mutate second"
- the Api -> Domain layering, with a diagram
- every command: build, test, e2e, Stryker and spec validation
- the demo accounts and limits
- a "how to work on a change" loop
- test expectations: boundaries in cents, and the three asserts every refusal test needs
- a fixed review format, with a check order and the three verdicts
- a "Never" list

**Showing that it matters:** the sub-agents received only a short task plus a pointer to AGENTS.md and their agent file, and the files show the result:
- The spec-writer produced boundary scenarios at, just below and just above every limit, with the "invoice unchanged" condition on every refusal. That rule comes from AGENTS.md and `openspec/config.yaml`, not from the prompt.
- The test-author used the three-assert refusal pattern and the `UpdateCount` check that AGENTS.md prescribes.
- The code-reviewer checked in the AGENTS.md order and used the AGENTS.md finding format.

### Step 2: skills (`.claude/skills/`)
| Skill | Purpose |
| --- | --- |
| `approval-rules` | Domain knowledge: limit table, exact reason texts, and the traps an agent falls into (mutate-before-validate, `==` username compare, Director-alone above 500k) |
| `run-tests` | Runs build and tests, and reports in one fixed `TESTS: PASS/FAIL` block |
| `mutation-report` | Stryker 4.13.0 install and run, plus the per-file summary script |
| `review-diff` | The review prompt, the finding format and the verdict table used in this PR |
| `commit-change` | One task per commit, staged by path, with a `What:` / `Why:` heredoc message |
| `openspec-*` (generated) | OpenSpec propose, apply, archive and sync workflows |

### Step 3: hooks for structured, same-format output (`.claude/settings.json`, `.claude/hooks/`)
| Hook | Event | Effect |
| --- | --- | --- |
| `log-interaction.js` | SessionStart, UserPromptSubmit, Pre/PostToolUse, SubagentStop, Stop | Appends one JSON record with a fixed shape to `logs/ai-interactions.jsonl`, with secrets redacted |
| `render-ai-log.js` | Stop | Regenerates `logs/ai-interactions.md` (summary and table) |
| `check-commit-message.js` | PreToolUse (Bash) | Blocks `git commit` without a `type(scope): subject` and `What:` / `Why:`, and blocks `--no-verify` / `-n` |
| `format-csharp.js` | PostToolUse (Edit/Write) | Runs `dotnet format whitespace` on every C# file an agent edits |
| `check-review-format.js` | SubagentStop | Blocks a code-reviewer report that is not in the AGENTS.md finding format |
| `.githooks/commit-msg` | git | The same commit rule for humans (`git config core.hooksPath .githooks`) |

All hooks were tested by piping sample events into them, including the review-finding cases in F4 and F5.

### Step 4: spec with a spec-driven tool (OpenSpec 1.14.3)
- `openspec init --tools claude,github-copilot`, with project context and artifact rules in `openspec/config.yaml`.
- The **spec-writer** sub-agent created the change `add-approval-limits-by-role`:
  - proposal, with the decisions and open questions
  - design, with decisions D1-D10 including the check order and the decide/apply split
  - a spec delta with **10 requirements and their scenarios**
  - a **5-task breakdown**
- `openspec validate --strict` passes. After implementation the change was archived, which produced `openspec/specs/invoice-approval/spec.md`. The history is in `openspec/changes/archive/2026-10-21-add-approval-limits-by-role/`.
- I reviewed the generated spec before committing. I accepted the agent's proposal for a fail-closed interim state between the two steps, so that step 1 is safe as a standalone commit. I fixed the stale `openspec/project.md` reference, which is OpenSpec 0.x layout, to `config.yaml`.

### Step 5: implementation in at least two steps
- **Step 1** (`aa3c513`) delivered the single-approver limits R1, R2 and R5 with 25 tests. Above 500,000 every approval is refused (fail-closed) until step 2.
- **Step 2** (`7bcabfa`) delivered the two-approver rule R3, R4 and R5 with 42 tests and the UI label. Its message says it replaces the interim fail-closed test.
- Each step was its own prompt or task and its own commit, with a message stating what and why.

### Step 6: tests that mean something
**Unit tests** (`backend/tests/InvoiceApp.Tests/ApprovalServiceTests.cs`, **63 tests**):
- Boundaries for each limit: 49,999.99 / 50,000.00 / 50,000.001 / 50,000.01, and 499,999.99 / 500,000.00 / 500,000.01.
- Every refusal goes through `AssertRefused`, which checks three things:
  - the exception is `ApprovalDeniedException`
  - the exact reason text
  - all seven invoice fields are unchanged and `UpdateCount == 0`
- R4 is tested with the same user, with `" Demo.Director "`, with `"DEMO.DIRECTOR"` and with a tab-padded name, and the check order (same-user before Director) is tested too.
- I reviewed every generated test. The test-author agent was also told to answer "what wrong implementation would still pass this test?" for each one. It found 4 weak existing tests and one real gap: a non-pending invoice could be rejected, so an approved invoice could be re-decided.

**Proving the negative rules are tested.** I injected each plausible wrong implementation by hand (`docs/mutation/bug-injection.md`):

| Wrong implementation | Rule | Result |
| --- | --- | --- |
| Set `Status = Approved` before the limit check | R5 | 8 tests fail |
| `firstUsername == secondUsername` | R4 | 4 tests fail |
| Assign `DecidedBy` before the "second must be Director" check | R5 | 2 tests fail |
| Director's approval above 500k is final | R3 | 1 test failed, so I added a second case |

**Playwright end-to-end test** (`e2e/tests/approval-limits.spec.ts`, page objects in `e2e/pages/`, `getByRole` / `getByLabel` only):
1. `demo.manager` creates and submits a 75,000.00 invoice.
2. The manager clicks Approve.
3. The alert shows `Manager approval limit is 50,000.00; invoice <id> is 75,000.00.`
4. The invoice is still in the pending list and still Pending Approval.

I confirmed the test **fails** when the Manager limit is raised to 500,000.

### Mutation scores (Stryker.NET 4.13.0 on `InvoiceApp.Domain`)

```
Stage                         Commit    Tests  ApprovalService.cs  Domain project
Before (upstream baseline)    66cb3f9       7      60.00%              30.77%
After feature (steps 1-2)     8d634dc      42      87.76%              63.24%
After test hardening          fe39c9a      62      97.96%              70.59%
Final (after review fixes)    595eda3      63      98.08%              71.83%
```

```
BEFORE (66cb3f9)
File                     | Killed | Survived | NoCoverage | Score
ApprovalService.cs       | 12     | 8        | 0          | 60.00%
DiscountCalculator.cs    | 0      | 0        | 17         | 0.00%
Invoice.cs               | 0      | 2        | 0          | 0.00%
TOTAL                    | 12     | 10       | 17         | 30.77%

AFTER (595eda3)
File                     | Killed | Survived | NoCoverage | Score
ApprovalService.cs       | 51     | 1        | 0          | 98.08%
DiscountCalculator.cs    | 0      | 0        | 17         | 0.00%
Invoice.cs               | 0      | 2        | 0          | 0.00%
TOTAL                    | 51     | 3        | 17         | 71.83%
```

- **ApprovalService.cs:** the one remaining survivor is equivalent. `approverRole ?? string.Empty` replaced with any other non-role string gives the same refusal.
- **Invoice.cs:** the 2 survivors are equivalent property defaults.
- **DiscountCalculator.cs:** the 17 uncovered mutants are pre-existing, untested code outside this feature (deferred).

Details and per-mutant judgements are in `docs/mutation/results.md`.

### Step 7: review your own PR with the agent, then judge the review
- The **code-reviewer** sub-agent ran the `review-diff` prompt against `git diff main...HEAD` and returned 7 findings in the enforced format.
- Every finding has a verdict in the PR description (`docs/PR_DESCRIPTION.md`, also used as the GitHub PR body):
  - **Fixed:** F2, F4, F5, F6
  - **Fixed in part, rest deferred:** F1 (concurrency: lock added; torn reads and multiple processes need a real store)
  - **Deferred:** F3 (UI label and accounts test needs an API test project)
  - **Fixed in part, rest dismissed:** F7 (secrets in the log are redacted; ignoring `logs/` is dismissed because the assignment requires the log to be committed)
- The workshop's review prompt is not in the repository, so the skill encodes the AGENTS.md checklist. To use the workshop prompt verbatim, paste it into `.claude/skills/review-diff/SKILL.md` and re-run the code-reviewer.

### Step 8: log of all AI interactions
- **`logs/ai-interactions.jsonl`** has one JSON record per interaction with a fixed shape: `timestamp, session_id, event, agent, tool, prompt, input, outcome`. **`logs/ai-interactions.md`** is the rendered table.
- From now on, every session in this repo is logged automatically by the hooks in step 3.
- The session that *created* the hooks could not be logged by them, because Claude Code loads project hooks when a session starts. It was backfilled from the Claude Code transcripts (main session plus the three sub-agents) with `.claude/hooks/import-transcript.js`, which writes the same record shape. Records from that import carry `"imported": true`.
- Secrets are redacted in both paths. I also grepped the committed log for the demo password and tokens.

### Step 9: multiple agents and sub-agents (`.claude/agents/`)
| Agent | Role | Used for |
| --- | --- | --- |
| main agent | orchestrator / implementer | steps 1-2 implementation, bug injection, running tools, judging every agent output |
| `spec-writer` | turns the brief into the OpenSpec change; edits only `openspec/` | commit 2 |
| `implementer` | one task at a time, tests included, never commits | defined for the apply workflow (the main agent played this role, task by task) |
| `test-author` | tests that fail when a rule is removed; critiques existing tests | commit 6 (20 test cases, 4 weak tests found, 1 real gap) |
| `mutation-analyst` | runs Stryker and turns survivors into a list of missing tests | defined. Its procedure (the `mutation-report` skill plus the survivor table) was run by the main agent, and the resulting table was handed to the test-author. It was not spawned as a separate process. |
| `code-reviewer` | read-only, strict reviewer in the enforced format | step 7 (7 findings) |

## 4. What the AI got wrong or I corrected, and judgement calls

- **Escaping slips in my own scripted edits** (a literal tab and a `\b` turned into a backspace) were caught by reading the diff and the hook output, then fixed before any commit.
- **The spec-writer's agent file referenced an OpenSpec 0.x path** (`openspec/project.md`). I corrected it to `config.yaml`.
- **The first BUG C injection was badly targeted.** It changed Manager behaviour instead of the Director-alone path. I re-ran it correctly, saw only one test catch it, and added a second case.
- **The test-author's report was reviewed, not trusted.** I read its diff, removed a stray blank line and re-ran Stryker myself to confirm the kills.
- **I did not apply every review finding.** F3 and part of F7 were deferred or dismissed with reasons, because "fix everything the reviewer says" is not judgement.

## 5. How to run everything

```
dotnet build backend/InvoiceApp.sln
dotnet test backend/InvoiceApp.sln                          # 63 unit tests
cd e2e && npm install && npx playwright install chromium && npm test   # 1 e2e test
dotnet tool install -g dotnet-stryker --version 4.13.0
cd backend/tests/InvoiceApp.Tests && dotnet stryker         # mutation run
npx @fission-ai/openspec validate --all                     # spec validation
git config core.hooksPath .githooks                         # enable the commit-msg hook
```

## 6. Demo video plan (8-10 min, things run live)

| Time | On screen |
| --- | --- |
| 0:00-1:00 | The brief, then `AGENTS.md` (rules table, layering, review format) and `.claude/` (agents, skills, hooks) |
| 1:00-2:00 | `openspec/specs/invoice-approval/spec.md` and the archived tasks; run `openspec validate --all` **live** |
| 2:00-3:00 | `git log --oneline main..HEAD`, showing a step 1 commit and a step 2 commit with their What/Why |
| 3:00-4:30 | **Live:** `dotnet test` (63 green). Then **live bug injection**: change `IsSameUser` to `==`, re-run, show 4 R4 tests fail, revert |
| 4:30-6:00 | **Live:** `npm test` in `e2e` (Playwright, headed with `npm run test:headed`), showing the refusal alert in the browser |
| 6:00-7:30 | **Live:** `dotnet stryker`, then compare with the baseline (60% to 98% on ApprovalService) |
| 7:30-9:00 | The PR description verdict table, the AI log (`logs/ai-interactions.md`), and a hook blocking a bad commit message **live** |
| 9:00-9:30 | Wrap-up: what the agents caught that I would have missed (reject on non-pending, concurrency) |
