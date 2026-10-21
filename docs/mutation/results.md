# Mutation scores (Stryker.NET 4.13.0, project InvoiceApp.Domain)

Run with `cd backend/tests/InvoiceApp.Tests && dotnet stryker` (config: `stryker-config.json`).
Score = (killed + timeout) / (killed + timeout + survived + no coverage).

## Summary

| Stage | Commit measured | Tests | ApprovalService.cs | Whole Domain project |
| --- | --- | --- | --- | --- |
| Before (baseline) | 66cb3f9 (upstream) | 7 | 60.00% (12 killed, 8 survived) | 30.77% |
| After feature | 8d634dc (steps 1-2 + e2e) | 42 | 87.76% (43 killed, 5 survived, 1 no coverage) | 63.24% |
| After hardening | fe39c9a | 62 | 97.96% (48 killed, 1 survived) | 70.59% |
| Final (after review fixes) | 595eda3 | 63 | **98.08%** (51 killed, 1 survived) | **71.83%** |

## Before (baseline)

```
File                     | Killed | Survived | NoCoverage | Score
-------------------------|--------|----------|------------|-------
ApprovalService.cs       | 12     | 8        | 0          | 60.00%
DiscountCalculator.cs    | 0      | 0        | 17         | 0.00%
Invoice.cs               | 0      | 2        | 0          | 0.00%
TOTAL                    | 12     | 10       | 17         | 30.77%
```

## After feature (before hardening)

```
File                     | Killed | Survived | NoCoverage | Score
-------------------------|--------|----------|------------|-------
ApprovalService.cs       | 43     | 5        | 1          | 87.76%
DiscountCalculator.cs    | 0      | 0        | 17         | 0.00%
Invoice.cs               | 0      | 2        | 0          | 0.00%
TOTAL                    | 43     | 7        | 18         | 63.24%
```

Surviving mutants in ApprovalService.cs at this point, and the test that now kills each:

| Line | Mutation | Why it survived | Killed by |
| --- | --- | --- | --- |
| Submit message | message -> `""` | only the exception type was asserted | `Submit_InvoiceThatIsNotADraft_ThrowsAndInvoiceUnchanged` |
| Reject reason message | message -> `""` | only the exception type was asserted | `Reject_WithoutReason_ThrowsAndInvoiceUnchanged` |
| `EnsurePending(invoice)` in Reject | statement removed | **no test rejected a non-pending invoice: an Approved invoice could be re-decided** | `Reject_InvoiceThatIsNotPending_ThrowsAndInvoiceUnchanged`, `Reject_AlreadyApprovedInvoice_KeepsTheOriginalDecision` |
| `_repository.Update` in Reject | statement removed | Reject never asserted it saved | `Reject_SavesTheInvoiceOnce` |
| `approverRole ?? string.Empty` | no coverage | no test passed a null role | `Approve_NullRole_IsRefusedAndInvoiceUnchanged` |
| not-found message | message -> `""` | message not asserted | `*_MissingInvoice_ThrowsNotFoundWithId` |

## After hardening

```
File                     | Killed | Survived | NoCoverage | Score
-------------------------|--------|----------|------------|-------
ApprovalService.cs       | 48     | 1        | 0          | 97.96%
DiscountCalculator.cs    | 0      | 0        | 17         | 0.00%
Invoice.cs               | 0      | 2        | 0          | 0.00%
TOTAL                    | 48     | 3        | 17         | 70.59%
```

## Final (after review fixes F1, F2)

```
File                     | Killed | Survived | NoCoverage | Score
-------------------------|--------|----------|------------|-------
ApprovalService.cs       | 51     | 1        | 0          | 98.08%
DiscountCalculator.cs    | 0      | 0        | 17         | 0.00%
Invoice.cs               | 0      | 2        | 0          | 0.00%
TOTAL                    | 51     | 3        | 17         | 71.83%
```

Remaining survivors, judged:

| File | Mutation | Verdict |
| --- | --- | --- |
| ApprovalService.cs | `approverRole ?? string.Empty` -> `?? "Stryker was here!"` | Equivalent: any non-role fallback gives the same refusal and the reason interpolates `approverRole` (null), not the fallback. |
| Invoice.cs | `Id = string.Empty` / `CustomerName = string.Empty` default -> other string | Equivalent for the rules: every code path sets both before use. |
| DiscountCalculator.cs | 17 no coverage | Out of scope for this feature (pre-existing, untested upstream). Deferred; see PR description. |
