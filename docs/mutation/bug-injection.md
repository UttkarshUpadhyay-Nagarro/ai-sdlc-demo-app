# Hand-injected "looks right, is not" bugs

Before trusting the generated tests, each plausible wrong implementation below was put into
`ApprovalService.cs` by hand, the unit tests were run, and the file was restored.

| # | Wrong implementation (what an agent tends to write) | Rule | Tests that failed |
| --- | --- | --- | --- |
| 0 | Set `Status = Approved` before the limit check (mutate, then validate) | R5 | 8 of 25 (every refusal test: the invoice was left changed) |
| A | `firstUsername == secondUsername` instead of trimmed, case-insensitive compare | R4 | 4 of 41 (`" Demo.Director "`, `"DEMO.DIRECTOR"`, tab-padded name, check order) |
| B | Assign `DecidedBy` before the "second approver must be a Director" check | R5 | 2 of 41 (Manager-as-second refusals: invoice not unchanged) |
| C | Let a Director's approval above 500,000 be final | R3 | 1 of 41, so a second case (Director alone at 900,000.00) was added |

Bug 0 was run on the step 1 commit; A to C on the step 2 code before it was committed.
