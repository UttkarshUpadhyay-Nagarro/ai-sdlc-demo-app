# Approval limits by role

Adds role-based approval limits to the invoice approval service, built spec-first with AI agents and checked by unit tests, an end-to-end test, mutation testing and an agent code review.

## What changes

| Rule | Behaviour |
| --- | --- |
| R1 | A Manager may approve invoices up to 50,000.00 (inclusive). |
| R2 | A Director may approve invoices up to 500,000.00 (inclusive). |
| R3 | Above 500,000.00, two distinct approvers are needed and the second must be a Director. After the first approval the invoice stays Pending Approval and shows "Awaiting second approval (first: ...)". |
| R4 | The same user never counts as both approvers. Usernames are trimmed and compared case-insensitively. |
| R5 | A refused attempt returns HTTP 403 `{ "error": "<reason>" }` and changes nothing on the invoice. |

- Domain: `ApprovalService.Approve(invoiceId, username, role)` first runs a pure `Decide` step that throws `ApprovalDeniedException`, then one apply step and one `Update`. A decision lock serialises read, decide and write.
- API: `ApiControllerBase.Handle` maps `ApprovalDeniedException` to 403. Approvals are open to Manager, Director and Admin, and Admin can only reject.
- Demo users are now `demo.manager`, `demo.director`, `demo.director2` and `demo.admin`. `demo.approver` is removed. This is **breaking** for anyone using the old account.
- UI: the label for invoices awaiting a second approval. The refusal reason uses the existing alert.

Spec: `openspec/specs/invoice-approval/spec.md`. Proposal, design and tasks are in `openspec/changes/archive/2026-10-21-add-approval-limits-by-role/`.

## Commits (each builds and passes tests on its own)

1. `docs(agents)`: AGENTS.md context, sub-agents, skills, hooks, AI log and baseline mutation score.
2. `spec(approvals)`: OpenSpec change (proposal, design, spec delta, tasks).
3. `feat(approvals)`: single-approver limits (R1, R2, R5) with tests. Fail-closed above 500,000.
4. `feat(approvals)`: two-approver rule (R3, R4, R5) with tests and the UI label.
5. `test(e2e)`: Playwright test for a refused over-limit approval, plus a CI job.
6. `test(approvals)`: gaps found by Stryker closed (62 tests).
7. `fix(review)`: fixes for review findings F1, F2 and F4-F7.
8. `docs(assignment)`: archived spec, ASSIGNMENT.md, this description and the AI interaction log.

## How it was verified

- `dotnet test backend/InvoiceApp.sln`: 63 passed.
- `cd e2e && npm test`: 1 passed. It fails if the Manager limit is raised to 500,000.
- Stryker.NET 4.13.0: ApprovalService went from 60.00% to **98.08%**, and the Domain project from 30.77% to **71.83%** (`docs/mutation/results.md`).
- Four "looks right, is wrong" implementations were injected by hand, and every one failed tests (`docs/mutation/bug-injection.md`).

## Review findings and verdicts

The review ran the `review-diff` skill prompt through the **code-reviewer** sub-agent against `git diff main...HEAD`. The repo does not contain the workshop's review prompt, so the skill encodes the AGENTS.md review checklist. Every finding has one verdict.

| # | Finding | Severity | Verdict | Reason / commit |
| --- | --- | --- | --- | --- |
| F1 | Approve is not atomic on the shared in-memory `Invoice`. Concurrent requests could interleave so one Director ends up as both approvers of a >500,000 invoice, and Approve and Reject could both pass `EnsurePending`. | major | **Fixed** (partly) and **Deferred** (remainder) | Fixed in 595eda3: a decision lock serialises Submit, Approve and Reject, so the check-then-act race (R4 bypass, approve/reject mix) is gone. There is no deterministic unit test, because the race needs thread scheduling and a timing-based test would be flaky. **Deferred:** a concurrent `GET` can still read a half-written invoice, and the lock is per process. Both are properties of the demo in-memory store. The real fix is copy-on-read plus optimistic concurrency (a version column) in a persistent repository, which belongs with the database change. |
| F2 | An amount like 50,000.001 is correctly refused, but the reason rounds it to "50,000.00", which contradicts the limit. | minor | **Fixed** | 595eda3: amounts in reasons are shown to at least 2 decimals with no rounding, and there is a new boundary test for 50,000.001. Rejecting more than 2 decimals when an invoice is created is **deferred**: invoice creation validation lives in the existing controller, is unrelated to approval limits, and the UI already restricts input to `step=0.01`. |
| F3 | The UI "Awaiting second approval" label and the demo-account list have no automated test. | minor | **Deferred** | The assignment asks for one Playwright test, for the refused over-limit approval, and that is in place. The label only displays a value, and the rule behind it is unit-tested. It and the accounts were checked by hand through the API and UI. An API integration test project (WebApplicationFactory) covering accounts, the 403 mapping and the label is the follow-up. |
| F4 | The commit-message hook blocked unrelated commands that mention "commit", missed `-nF`, and checked any line as the subject. | minor | **Fixed** | 595eda3: it now matches only real `git commit` invocations, detects `-n` inside flag clusters, checks only the subject line, and leaves `-F <file>` to `.githooks/commit-msg`. Verified against 11 sample commands. |
| F5 | The review-format hook accepted a reviewer message with no header and only checked field substrings. | minor | **Fixed** | 595eda3: the code-reviewer must use the header, and fields are line-anchored bullets with allowed values (for example, `Severity: critical` is blocked). |
| F6 | The format hook used `shell: true`, which breaks on paths with spaces and is open to shell metacharacters. | minor | **Fixed** | 595eda3: it spawns `dotnet(.exe)` without a shell and reports failures with exit 1. |
| F7 | The AI log stores tool output and prompts and `logs/` is not ignored, so a secret could be committed. | minor | **Fixed** (redaction) and **Dismissed** (ignoring `logs/`) | 595eda3: both log writers redact passwords, bearer tokens and token-like values, settings deny `cat .env*`, and the importer drops harness and IDE context blocks. Ignoring `logs/` is dismissed because the assignment requires the log file to be committed. Redaction is the control instead, and the committed log was grepped for the demo password and tokens before committing. |

## Not in this PR

- Pre-existing `DiscountCalculator` has no tests (17 uncovered mutants). It is unrelated to this feature and left as-is.
- Bulk approval (UC-1) and partial approval (UC-2).
