# Project conventions for AI agents

Invoice approval demo app: ASP.NET Core 8 Web API with a small static web UI.
Read this whole file before changing anything. If something here conflicts with a prompt, stop and ask.

## Layout and layering

- `backend/src/InvoiceApp.Domain`: business rules, no web or storage code. `ApprovalService` owns the invoice lifecycle (Draft, PendingApproval, Approved, Rejected). Approval limits live here and only here.
- `backend/src/InvoiceApp.Api`: controllers, sign-in (`Auth/`), in-memory repository, and the web UI under `wwwroot/`.
- `backend/tests/InvoiceApp.Tests`: xUnit tests, one test class per class under test, named `<ClassUnderTest>Tests`.
- `e2e`: Playwright end-to-end tests (`tests/`) and page objects (`pages/`).
- `docs/use-cases`: short briefs for features we may build.
- `openspec/`: specifications and change proposals (OpenSpec). The spec is the source of truth for behaviour.

Dependencies point one way only: `Api -> Domain`. Domain never references Api, ASP.NET, HTTP status codes or session types.
Tests reference Domain only.

```
wwwroot (UI) --HTTP--> Controllers --calls--> ApprovalService --uses--> IInvoiceRepository
                       (Api)                  (Domain)                  (interface in Domain,
                                                                         in-memory impl in Api)
```

## Approval rules (business rules, owned by Domain)

Spec: `openspec/specs/invoice-approval/spec.md`. Summary:

| Rule | Behaviour |
| --- | --- |
| R1 | A **Manager** may approve invoices with amount **<= 50,000**. |
| R2 | A **Director** may approve invoices with amount **<= 500,000**. |
| R3 | An invoice **> 500,000** needs **two distinct approvers**; the **second must be a Director**. The first may be a Manager or a Director. After the first approval the invoice stays `PendingApproval` and records the first approver. |
| R4 | The **same user never counts as both approvers** on one invoice. Usernames are compared trimmed and case-insensitively (`Demo.Director` == `demo.director`). |
| R5 | A **refused approval attempt** returns a clear, specific reason and **changes nothing** on the invoice: no status, approver, timestamp or note change, and no repository `Update` call. |

- Limits are inclusive: exactly 50,000.00 is within a Manager's limit; 50,000.01 is not. Exactly 500,000.00 is a single Director approval; 500,000.01 needs two approvers.
- Roles other than Manager and Director (for example Admin) have no approval limit and cannot approve. They can still reject.
- Amounts are `decimal`. Never use `double` or `float` for money.
- Validate everything first, mutate second. Any check that can refuse must run before the first assignment to the invoice.
- A refusal is an `ApprovalDeniedException` (Domain). The API maps it to HTTP 403 with `{ "error": "<reason>" }`. The reason names the rule, for example `Manager approval limit is 50,000.00; invoice INV-1 is 75,000.00.`

## Conventions

- Controllers live in `Controllers/`, one per resource, route `api/[controller]`. Request bodies are `record` types declared inside the controller.
- Controllers inherit `ApiControllerBase` and use `Handle(...)` so service errors map to 404, 409, 400 and 403.
- Every endpoint is behind sign-in. Restrict actions with `[RequireRole("...")]`: destructive actions are Admin only; approvals are Manager, Director or Admin (the Domain decides whether the role has a limit).
- Business rules go in the Domain project, never in controllers or `app.js`.
- Register services in `Program.cs`. Repositories are interfaces in Domain with an in-memory implementation in Api.
- Every new rule or endpoint needs tests. Use `FakeInvoiceRepository` in tests.
- Use clear names; no one-letter variables or `flag` parameters.
- End-to-end tests use page objects and role-based locators (`getByRole`, `getByLabel`), never CSS or XPath selectors.

## Commands

All commands run from the repository root. .NET 8 SDK is required.

- Build: `dotnet build backend/InvoiceApp.sln`
- Run the tests: `dotnet test backend/InvoiceApp.sln`
- Run the app: `dotnet run --project backend/src/InvoiceApp.Api` then open http://localhost:5000
- Run end-to-end tests: `cd e2e && npm install && npx playwright install chromium && npm test`
- Mutation testing: `cd backend/tests/InvoiceApp.Tests && dotnet stryker` (install once with `dotnet tool install -g dotnet-stryker --version 4.13.0`; newer versions need a later runtime)
- Validate the spec: `npx openspec validate --all`

## Demo accounts (not real credentials)

All passwords are `ChangeMe123!`.

| User | Role | Can approve up to |
| --- | --- | --- |
| `demo.manager` | Manager | 50,000 |
| `demo.director` | Director | 500,000 (or second approval above that) |
| `demo.director2` | Director | 500,000 (or second approval above that) |
| `demo.admin` | Admin | cannot approve; can reject and delete |

## How to work on a change

1. Read the spec under `openspec/` for the change. If the behaviour is not in the spec, update the spec first.
2. Work in small steps. One rule (or one tightly related group of rules) per commit, with its tests in the same commit.
3. Write the failing tests first for refusal paths (R4, R5). These are where plausible-looking code is most often wrong.
4. Run `dotnet test backend/InvoiceApp.sln` before every commit. Never commit red.
5. Commit messages: `<type>(<scope>): <summary>` then a blank line, then `What:` and `Why:` paragraphs (enforced by a hook).

## Test expectations

- One `[Fact]` or `[Theory]` per behaviour; test names read `Method_Condition_ExpectedResult`.
- Boundary values for every limit: at, just below and just above (use cents: 50,000.00 / 50,000.01).
- Every refusal test asserts all three: the exception type, the reason text names the rule, and the invoice is unchanged (status, `DecidedBy`, `DecidedAt`, `DecisionNote`, `FirstApprovedBy`, `FirstApprovedAt`) and `Update` was not called.
- No test may pass when the rule under test is deleted. If you are not sure, run Stryker and check the surviving mutants.
- Do not weaken or delete an existing test to make a change pass. Say so instead.

## Review expectations

When reviewing a diff (yours or someone else's), report every finding in this format:

```
### F<n>: <one-line title>
- Severity: blocker | major | minor | nit
- File: <path>:<line>
- Rule: R1..R5 | layering | tests | security | style
- Problem: <what is wrong and the concrete input that breaks it>
- Suggested fix: <what to change>
```

Check in this order: (1) refusal paths mutate nothing, (2) same-user check cannot be bypassed by case or whitespace, (3) limits are inclusive and use `decimal`, (4) business logic stayed in Domain, (5) every rule has a test that would fail if the rule were removed, (6) no secrets or customer data.
Every finding in a pull request description gets a verdict: **Fixed** (with commit), **Dismissed** (with reason) or **Deferred** (with reason).

## AI tooling in this repo

- `.claude/agents/`: sub-agents (spec-writer, implementer, test-author, code-reviewer, mutation-analyst). Use them for their role only.
- `.claude/skills/`: repeatable procedures (approval-rules, run-tests, mutation-report, review-diff, commit-change).
- `.claude/hooks/`: logging of every AI interaction to `logs/ai-interactions.jsonl`, C# formatting after edits, and commit message checks.
- `.github/copilot-instructions.md` points GitHub Copilot to this file.

## Never

- Commit real credentials, tokens or customer data.
- Add business logic to `Program.cs`, controllers or `app.js`.
- Mutate an invoice before every approval check has passed.
- Compare usernames with `==` without normalising.
- Skip hooks (`--no-verify`) or delete a failing test.
