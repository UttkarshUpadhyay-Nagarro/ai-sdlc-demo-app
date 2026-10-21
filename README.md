# Invoice Approval Demo App

A small invoice approval app used for live AI-in-SDLC demos. It is deliberately simple: a .NET 8 API, a plain web UI, and an in-memory store, so it runs with one command and no database.

## Run it

```
dotnet run --project backend/src/InvoiceApp.Api
```

Open http://localhost:5000 and sign in:

| User | Password | Role | May approve |
| --- | --- | --- | --- |
| `demo.manager` | `ChangeMe123!` | Manager | up to 50,000 |
| `demo.director` | `ChangeMe123!` | Director | up to 500,000; second approval above that |
| `demo.director2` | `ChangeMe123!` | Director | up to 500,000; second approval above that |
| `demo.admin` | `ChangeMe123!` | Admin | cannot approve (can reject and delete) |

These are demo accounts for a local, in-memory app. They are not real credentials.

## What it does

1. Create an invoice (it starts as a draft).
2. Submit it for approval.
3. A Manager or Director approves it within their limit (two distinct approvers above 500,000, the second a Director), or anyone with an approval role rejects it with a reason.

Invoices move through Draft, Pending Approval, then Approved or Rejected.

## Tests

```
dotnet test backend/InvoiceApp.sln
```

## Project layout

```
backend/
  src/InvoiceApp.Domain   business rules
  src/InvoiceApp.Api      controllers, sign-in, web UI (wwwroot)
  tests/InvoiceApp.Tests  xUnit tests
docs/use-cases            short feature briefs
AGENTS.md                 conventions for AI coding agents
```

## Use cases

- [UC-1 Bulk invoice approval](docs/use-cases/UC-1-bulk-approval.md)
- [UC-2 Partial approval](docs/use-cases/UC-2-partial-approval.md)
