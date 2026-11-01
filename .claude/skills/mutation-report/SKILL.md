---
name: mutation-report
description: Run Stryker.NET 4.13.0 against the Domain project and produce a per-file mutation score summary for the write-up. Use for before/after mutation scores.
---

# Mutation report

Install once (newer versions target a later runtime and fail on .NET 8):

```
dotnet tool install -g dotnet-stryker --version 4.13.0
```

Run from the test project (config in `stryker-config.json` there):

```
cd backend/tests/InvoiceApp.Tests
dotnet stryker --output ../../../docs/mutation/<label>
```

Summarise per file:

```
node docs/mutation/summarise.js docs/mutation/<label>/reports/mutation-report.json
```

Paste the printed table as text into `ASSIGNMENT.md` under "Mutation scores". Always state which commit was measured.
