---
name: approval-rules
description: Domain knowledge for invoice approval limits by role (Manager 50,000, Director 500,000, two distinct approvers above 500,000 with a Director second, same-user ban, refusals change nothing). Load whenever touching ApprovalService, approval tests, the approvals controller or the approvals UI.
---

# Approval rules

Source of truth: `openspec/specs/invoice-approval/spec.md`. Short form in `AGENTS.md`.

| Amount | Who can approve | Result |
| --- | --- | --- |
| <= 50,000.00 | Manager or Director | Approved in one step |
| 50,000.01 to 500,000.00 | Director | Approved in one step |
| > 500,000.00 | 1st: Manager or Director; 2nd: a different Director | Stays PendingApproval after the 1st, Approved after the 2nd |

Refusal reasons (exact wording used in code and tests):

- Role without a limit: `Role <role> cannot approve invoices.`
- Over a single-approver limit: `<Role> approval limit is <limit:N2>; invoice <id> is <amount:N2>.`
- Second approver not a Director: `Invoice <id> is over 500,000.00; the second approver must be a Director.`
- Same user twice: `<user> already gave the first approval for invoice <id>; a different approver is required.`

Implementation checklist:

1. Normalise usernames with `Trim()` and compare with `StringComparison.OrdinalIgnoreCase`.
2. Run every check before assigning anything on the invoice. No `Update` call on refusal.
3. Throw `ApprovalDeniedException(reason)`; the API maps it to 403.
4. Money is `decimal`; limits are inclusive (`amount <= limit`).

Traps an agent tends to fall into:

- Setting `FirstApprovedBy` and then checking the role of the second approver, so a refused attempt leaves state behind.
- Comparing `approver == invoice.FirstApprovedBy` with `==`, so `Demo.Director` passes as a different user.
- Letting a Director approve > 500,000 alone because `amount <= DirectorLimit` was the only check.
- Treating the first approval of a > 500,000 invoice as final.
