# Design: Approval limits by role

## Context

See `proposal.md` for motivation and the agreed decisions; requirements are in `specs/invoice-approval/spec.md`.

Current state:
- `ApprovalService.Approve(invoiceId, approver)` finds the invoice, checks it is `PendingApproval`, then sets `Status`, `DecidedBy`, `DecidedAt` and calls `IInvoiceRepository.Update`. It has no notion of role or amount.
- `ApprovalsController` is `[RequireRole("Approver", "Admin")]` and passes only `session.Username`. The session (`UserSession`) already carries `Role`.
- `ApiControllerBase.Handle` maps `KeyNotFoundException` -> 404, `InvalidOperationException` -> 409, `ArgumentException` -> 400.
- Demo users come from `appsettings.json` (`demo.approver`/Approver, `demo.admin`/Admin). `InMemoryInvoiceRepository` seeds `INV-1003` with `DecidedBy = "demo.approver"`.
- `FakeInvoiceRepository.Update` is a no-op and does not record calls; it returns the same instance, so tests observe mutations directly.
- `app.js` renders the pending list and already shows API `error` text in `#decision-error` (`role="alert"`).

Constraints (AGENTS.md): business rules only in Domain; Domain has no HTTP types; `decimal` for money; validate everything before the first assignment to the invoice.

## Goals / Non-Goals

**Goals:**
- All approval-authority decisions in one Domain method, every refusal raised before any mutation.
- One distinct, testable reason text per rule.
- Each of R1-R5 covered by a test that fails if the rule is removed (checked with Stryker).

**Non-Goals:**
- Configurable limits (they are constants in Domain).
- Persisting or auditing refused attempts.
- Changing Submit, Create or Delete behaviour, or the sign-in mechanism.
- Bulk or partial approval (UC-1, UC-2).

## Decisions

### D1. Role is passed into the Domain as a string
`Approve(string invoiceId, string approverUsername, string approverRole)`. The controller passes `session.Username` and `session.Role`.
- Alternative: a `Role` enum parsed in the API. Rejected: unknown roles would need an API-side mapping, and the spec says unknown roles are refused with their name in the reason. Domain compares role names ordinally (`"Manager"`, `"Director"`) as configured.

### D2. Limits are a small lookup in Domain
A private `static readonly IReadOnlyDictionary<string, decimal>` (`Manager` -> 50,000.00m, `Director` -> 500,000.00m) and a `TwoApproverThreshold = 500_000.00m` constant. A role not in the map has no limit.
- Alternative: a policy class per role. Rejected as over-engineering for two roles.

### D3. Check order (all before mutation)
1. Find invoice (404) and ensure `PendingApproval` (409) — unchanged.
2. Role has a limit, else `Role <role> cannot approve invoices.`
3. If `Amount <= 500,000.00`: `Amount <= limit`, else `<Role> approval limit is <limit>; invoice <id> is <amount>.` Then final approval.
4. If `Amount > 500,000.00` and no first approval: record first approval (Manager or Director).
5. If `Amount > 500,000.00` and a first approval exists: same-user check (R4) first, then Director check (R3); then final approval.

Delivery is in two commits (tasks 1 and 2). After task 1 only steps 1-3 exist and every role is held to `Amount <= limit`, so an invoice above 500,000.00 is refused for everyone (`Director approval limit is 500,000.00; ...`). This interim state is fail-closed: nothing above 500,000 can be approved by one person. Task 2 replaces it with steps 4-5.

R4 before R3 so that a Manager repeating their own first approval gets the more specific "already gave the first approval" reason. The checks are written as a pure "decide" step that returns an outcome (Final / First) or throws, followed by a single "apply" step that mutates and calls `Update` once.

### D4. `ApprovalDeniedException` in Domain, mapped to 403 in Api
`public class ApprovalDeniedException : Exception` (message = reason). `Handle` gains a `catch (ApprovalDeniedException ex) => StatusCode(403, new { error = ex.Message })`. It must not derive from `InvalidOperationException`, or it would be caught as 409.
- Alternative: return a result object. Rejected: the existing service style uses exceptions mapped in one place.

### D5. Formatting of reasons
Amounts and limits use `ToString("N2", CultureInfo.InvariantCulture)` so the text is `50,000.01` on every machine.

### D6. Username comparison
`string.Equals(a?.Trim(), b?.Trim(), StringComparison.OrdinalIgnoreCase)` in one private helper. The stored `FirstApprovedBy`/`DecidedBy` keep the session username as given; the R4 reason quotes the stored first approver.

### D7. Invoice fields
`Invoice` gets `string? FirstApprovedBy` and `DateTime? FirstApprovedAt` (UTC). They serialize as `firstApprovedBy`/`firstApprovedAt` and are read by `app.js` for the label. Reject does not touch them.

### D8. Roles and demo users
`ApprovalsController` becomes `[RequireRole("Manager", "Director", "Admin")]` (reject stays available to Admin). `appsettings.json` users: `demo.manager`/Manager, `demo.director`/Director, `demo.director2`/Director, `demo.admin`/Admin. Seed `INV-1003.DecidedBy` changes to `demo.manager` (amount 12,300.00 is within the Manager limit). No new seed invoices: the e2e test creates and submits its own 75,000.00 invoice through the UI (any signed-in user may create and submit), so it does not depend on seed state.

### D9. Tests
- `FakeInvoiceRepository` gains `UpdateCount` so refusal tests assert `Update` was not called.
- A helper asserts all six fields are unchanged after a refusal.
- `[Theory]` with `decimal` passed as string (xUnit cannot use decimal literals in `InlineData`) for at/below/above boundaries.
- Existing tests that use `demo.approver` switch to a Manager/Director username and role; no assertion is removed.

### D10. UI
`renderPending` adds a `span` with `Awaiting second approval (first: <firstApprovedBy>)` when `firstApprovedBy` is set. No limit logic in `app.js`; refusal text comes from the API. E2E uses a page object (`e2e/pages/`) with `getByRole`/`getByLabel` only.

## Risks / Trade-offs

- [A refusal check added after the first assignment would partially mutate the invoice] -> decide/apply split (D3) and tests asserting all fields plus `UpdateCount == 0`.
- [Case/whitespace bypass of R4] -> single comparison helper and a dedicated test with ` Demo.Director `.
- [`ApprovalDeniedException` accidentally mapped to 409] -> it does not inherit `InvalidOperationException`; API-level check in task 1.
- [Removing `Approver` breaks existing sessions/bookmarks] -> demo only; sessions are in-memory and reset on restart.
- [Culture-dependent number formatting] -> invariant culture in D5; tests assert exact strings.
- [Manager can give the first approval above 500,000 but cannot approve 75,000 alone] -> intended by the agreed decision; documented in the spec scenarios.

## Migration Plan

No data migration (in-memory store). Deploy = restart the app with new `appsettings.json`. Rollback = revert the commits; no persisted state depends on the new fields.
