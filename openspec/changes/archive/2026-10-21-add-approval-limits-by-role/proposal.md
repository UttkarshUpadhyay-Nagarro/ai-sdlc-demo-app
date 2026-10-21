# Proposal: Approval limits by role

## Why

Today any user with the `Approver` or `Admin` role can approve an invoice of any amount on their own (`ApprovalService.Approve` only checks that the invoice is pending). Finance needs approval authority tied to role and amount, and large invoices need two people, so that no single user can release a high-value payment.

## What Changes

- **R1**: A Manager may approve invoices with amount <= 50,000.00.
- **R2**: A Director may approve invoices with amount <= 500,000.00.
- **R3**: An invoice > 500,000.00 needs two approvals by different users. The first may be by a Manager or a Director and leaves the invoice `PendingApproval` with `FirstApprovedBy`/`FirstApprovedAt` recorded. The second must be by a Director and moves the invoice to `Approved` with `DecidedBy` = the second approver.
- **R4**: The same user never counts as both approvers on one invoice. Usernames are compared trimmed and case-insensitively.
- **R5**: A refused approval attempt returns a specific reason and changes nothing on the invoice (status, `DecidedBy`, `DecidedAt`, `DecisionNote`, `FirstApprovedBy`, `FirstApprovedAt`) and nothing is saved.
- Roles without an approval limit (Admin, any unknown role) cannot approve; Admin can still reject.
- New Domain exception `ApprovalDeniedException`; the API maps it to HTTP 403 `{ "error": "<reason>" }`. Existing errors are unchanged (missing invoice -> 404, not pending -> 409, missing reject reason -> 400).
- `Invoice` gains `FirstApprovedBy` (string?) and `FirstApprovedAt` (DateTime?).
- **BREAKING**: the `Approver` role and the `demo.approver` demo account are removed. Demo accounts become `demo.manager` (Manager), `demo.director` and `demo.director2` (Director) and `demo.admin` (Admin). The approvals endpoints accept roles Manager, Director and Admin.
- UI: a pending invoice with a first approval shows "Awaiting second approval (first: <user>)". Refusal reasons appear in the existing `decision-error` alert.
- Rejecting an invoice that already has a first approval is allowed; the first-approval fields are kept as history.

## Capabilities

### New Capabilities
- `invoice-approval`: who may approve or reject a pending invoice, the per-role approval limits, the two-approver rule for large invoices, and how refused attempts are reported. (No spec exists yet under `openspec/specs/`; AGENTS.md already points to this path.)

### Modified Capabilities
- None.

## Impact

- Domain: `ApprovalService.Approve` gains the approver's role and runs every check before any mutation; `Invoice` gets two fields; new `ApprovalDeniedException`.
- Api: `ApiControllerBase.Handle` maps `ApprovalDeniedException` to 403; `ApprovalsController` passes the session role and uses `[RequireRole("Manager", "Director", "Admin")]`; `appsettings.json` demo users; seed data in `InMemoryInvoiceRepository` references `demo.approver` and is updated.
- UI (`wwwroot/app.js`): second-approval label on the pending list; no business logic.
- Tests: `ApprovalServiceTests` extended (boundaries, refusals, two-approver flow); `FakeInvoiceRepository` counts `Update` calls; existing tests that use `demo.approver` move to a Manager/Director username without weakening assertions.
- E2E: first Playwright test and page objects under `e2e/`.
- Docs: `ASSIGNMENT.md` write-up of the AI-assisted process (task 5).

## Decisions and assumptions (agreed, not open)

| Question | Decision |
| --- | --- |
| Are limits inclusive? Which number type? | Inclusive, `decimal`. 50,000.00 is OK for a Manager, 50,000.01 is not. 500,000.00 is a single Director approval; 500,000.01 needs two approvers. |
| Who may give the first approval above 500,000? | A Manager or a Director. A Manager's first approval above 500,000 is not refused by R1, because it is not a final decision. |
| What happens after the first approval? | Invoice stays `PendingApproval`; `FirstApprovedBy`/`FirstApprovedAt` are set; `DecidedBy`/`DecidedAt` stay empty. |
| Who may give the second approval? | Only a Director who is a different user (trimmed, case-insensitive) from the first approver. Then `Approved`, `DecidedBy` = second approver. |
| Roles without a limit? | Admin and unknown roles cannot approve (refused with reason). Admin can still reject. |
| How is a refusal reported? | `ApprovalDeniedException` in Domain -> HTTP 403 `{ "error": "<reason>" }`; UI shows it in `decision-error`. No repository `Update`. |
| Reject after a first approval? | Allowed via the existing Reject action with a reason; first-approval fields are kept. |
| Legacy `Approver` role? | Replaced by Manager/Director demo users; `demo.admin` stays Admin. |
| Reason texts | Exact strings are fixed in the spec; amounts and limits use format `N2` with invariant culture (e.g. `50,000.01`). |

## Open questions (deferred, do not block this change)

- Should a Director who gives the first approval above 500,000 be allowed to finish alone? Assumption: no; R3 requires two distinct users regardless of role.
- Should a refused attempt be audited (logged) anywhere? Assumption: not in this change; the response reason is enough for the demo.
