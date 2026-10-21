---
name: review-diff
description: The pull request review prompt for this repo. Reviews a diff against AGENTS.md and the spec and outputs findings in the fixed format, then records verdicts (Fixed / Dismissed / Deferred). Use when reviewing a PR or a branch.
---

# Review a diff

Prompt to run (against `git diff main...HEAD`):

> You are reviewing a pull request to an invoice approval service. Read AGENTS.md and the spec in openspec/specs/invoice-approval/spec.md. Review only the diff. For each problem, give a concrete input that breaks it. Check, in order:
> 1. Does any refused approval attempt change the invoice or call `Update`?
> 2. Can the same user count as both approvers (case, whitespace, first approver = second approver)?
> 3. Are limits inclusive, in `decimal`, and is > 500,000 never approved by one person?
> 4. Did any business rule leak into controllers, Program.cs or app.js?
> 5. Would every rule's tests fail if the rule were deleted? Name the test that would not.
> 6. Secrets, customer data, error messages leaking internals.
> 7. Anything else a careful senior engineer would block on.

Output format (enforced by `.claude/hooks/check-review-format.js`):

```
## Review of main...HEAD

### F1: <title>
- Severity: blocker | major | minor | nit
- File: <path>:<line>
- Rule: R1..R5 | layering | tests | security | style
- Problem: <what breaks, with the input>
- Suggested fix: <change>
```

Then, for the PR description, copy every finding into a table with a verdict:

| # | Finding | Severity | Verdict | Reason / commit |
| --- | --- | --- | --- | --- |
| F1 | ... | major | Fixed | abc1234 |
| F2 | ... | nit | Dismissed | <why it is not a problem> |
| F3 | ... | minor | Deferred | <why not now, and where it is tracked> |

Every finding gets exactly one verdict. "Dismissed" and "Deferred" always carry a reason.
