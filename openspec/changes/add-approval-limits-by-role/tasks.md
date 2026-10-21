# Tasks

Each numbered group is one commit (`<type>(<scope>): <summary>` + `What:`/`Why:`), with its own tests, and `dotnet test backend/InvoiceApp.sln` green before committing. Write the failing refusal tests first.

## 1. Single-approver limits (R1, R2, roles without a limit, R5 for these)

- [x] 1.1 Add `FakeInvoiceRepository.UpdateCount` and a test helper that asserts status, `DecidedBy`, `DecidedAt`, `DecisionNote`, `FirstApprovedBy`, `FirstApprovedAt` are unchanged; verify existing tests still pass
- [x] 1.2 Write failing `ApprovalServiceTests` for: Manager at 49,999.99 / 50,000.00 approved, 50,000.01 and 500,000.00 refused with `Manager approval limit is 50,000.00; invoice INV-1 is <amount>.`; Director at 499,999.99 / 500,000.00 / 50,000.01 approved; Admin and unknown role refused with `Role <role> cannot approve invoices.`; each refusal asserts `ApprovalDeniedException`, exact reason, unchanged invoice and `UpdateCount == 0`; verify they fail for the right reason
- [x] 1.3 Add `ApprovalDeniedException` and `Invoice.FirstApprovedBy`/`FirstApprovedAt` (Domain); change `ApprovalService.Approve` to take the approver role, with limit lookup (Manager 50,000.00m, Director 500,000.00m), invariant `N2` reasons and all checks before mutation (design D1-D5). Interim (fail-closed) behaviour until task 2: every role is held to `Amount <= limit`, so above 500,000.00 a Director is refused with `Director approval limit is 500,000.00; invoice INV-1 is 500,000.01.` and a Manager with the Manager reason; add tests for this interim behaviour marked in their names/comments as replaced by task 2; verify tests from 1.2 pass
- [x] 1.4 Update existing tests that use `demo.approver` to Manager/Director usernames and roles without removing any assertion; verify `dotnet test` is green
- [x] 1.5 Map `ApprovalDeniedException` to HTTP 403 `{ "error": reason }` in `ApiControllerBase.Handle` (not via `InvalidOperationException`); pass `session.Role` from `ApprovalsController`; change its filter to `[RequireRole("Manager", "Director", "Admin")]`; verify manually (or with a request) that `demo.manager` approving a 75,000.00 invoice returns 403 with the exact reason and the invoice is still PendingApproval
- [x] 1.6 Replace demo users in `appsettings.json` with `demo.manager`, `demo.director`, `demo.director2`, `demo.admin` and change seed `INV-1003.DecidedBy` to `demo.manager`; verify each account signs in and `demo.approver` no longer does

## 2. Two-approver rule above 500,000 (R3, R4, R5 for these)

- [x] 2.1 Write failing tests: Director alone at 500,000.01 records first approval and stays PendingApproval; Manager at 500,000.01 and 600,000.00 records first approval; Director completes a Manager's first approval and `demo.director2` completes `demo.director`'s (DecidedBy = second, first-approval fields kept); Manager as second approver refused with `Invoice INV-1 is over 500,000.00; the second approver must be a Director.`; same Director, same Manager and ` Demo.Director ` vs `demo.director` refused with `<first> already gave the first approval for invoice INV-1; a different approver is required.`; Admin as second approver refused; Reject after a first approval keeps first-approval fields; every refusal asserts unchanged invoice and `UpdateCount == 0`
- [x] 2.2 Implement the > 500,000.00 branch in `ApprovalService` per design D3/D6 (same-user check before Director check, trimmed case-insensitive comparison, single mutate-and-Update step); replace the interim > 500,000.00 refusal tests from 1.3 with the 2.1 tests (state this in the commit message: the spec supersedes the interim behaviour, no other test is weakened); verify all tests from 2.1 pass and `dotnet test` is green
- [x] 2.3 In `wwwroot/app.js` show `Awaiting second approval (first: <user>)` on pending invoices with `firstApprovedBy` (display only, no rules); verify manually: `demo.manager` approves a 600,000.00 invoice, label appears, `demo.director` approves it and it moves to Approved

## 3. End-to-end test: Manager over-limit refusal in the UI

- [x] 3.1 Add page objects under `e2e/pages/` (`LoginPage`, `InvoicesPage`, `ApprovalsPage`) using only `getByRole`/`getByLabel`; verify no CSS or XPath selectors are used
- [x] 3.2 Add `e2e/tests/approval-limits.spec.ts`: sign in as `demo.manager`, create and submit a 75,000.00 invoice, approve it on the Approvals tab, assert the alert shows `Manager approval limit is 50,000.00; invoice <id> is 75,000.00.` and the invoice is still in the pending list and shows Pending Approval on the Invoices tab; verify with `cd e2e && npm test` (passes, and fails if the limit check is removed)

## 4. Mutation testing

- [ ] 4.1 Run `dotnet stryker` in `backend/tests/InvoiceApp.Tests` on the code before task 1 (baseline already in `docs/mutation/baseline.txt` if current) and after task 3; record scores and surviving mutants in `docs/mutation/`
- [ ] 4.2 Add or tighten tests for every surviving mutant in `ApprovalService` approval rules (boundary operators, comparison, check order, mutate-before-validate) or document why it is equivalent; verify by re-running Stryker that no rule-related mutant survives

## 5. Review and write-up

- [ ] 5.1 Review the full diff with the code-reviewer agent using the AGENTS.md finding format and check order; give every finding a verdict (Fixed with commit / Dismissed with reason / Deferred with reason) in the PR description; verify every blocker/major is Fixed
- [ ] 5.2 Write `ASSIGNMENT.md` describing the spec -> implementation -> tests -> mutation -> review flow, the AI tools/agents used, and what was corrected by hand; verify `openspec validate add-approval-limits-by-role --strict` and `dotnet test backend/InvoiceApp.sln` pass

## Workflow follow-up

- Archive the change with `openspec archive add-approval-limits-by-role` after review, creating `openspec/specs/invoice-approval/spec.md`.
- Verify AGENTS.md still matches the archived spec.
