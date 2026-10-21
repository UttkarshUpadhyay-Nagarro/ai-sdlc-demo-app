---
name: run-tests
description: Build and run the .NET unit tests (and optionally Playwright e2e) and report the result in one fixed format. Use before every commit and at the end of every implementation task.
---

# Run tests

1. `dotnet build backend/InvoiceApp.sln --nologo -v q`
2. `dotnet test backend/InvoiceApp.sln --nologo --logger "console;verbosity=minimal"`
3. Only if asked for e2e: `cd e2e && npm test` (starts the API itself on http://localhost:5000).

Report exactly this block, nothing else around it:

```
TESTS: <PASS|FAIL>
unit: <passed>/<total> passed, <failed> failed
e2e: <passed>/<total> passed | not run
failing: <TestName> - <first line of message>   (one line per failure, or "none")
```

If anything fails, stop. Do not change a test to make it pass unless the spec says the test is wrong.
