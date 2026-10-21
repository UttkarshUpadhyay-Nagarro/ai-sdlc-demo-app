---
name: commit-change
description: Create a commit in the repo format (type(scope) subject, What and Why paragraphs). Use for every commit; the check-commit-message hook and .githooks/commit-msg reject anything else.
---

# Commit a change

1. Run the `run-tests` skill. Do not commit on FAIL.
2. Stage only the files for this one step (`git add <paths>`; never `git add -A` blindly).
3. Commit with a heredoc so the body survives:

```
git commit -F - <<'MSG'
feat(approvals): <imperative summary, max 72 chars>

What: <what changed, in terms of behaviour and files>

Why: <the rule or problem this addresses, and any decision taken>

Spec: openspec/changes/<change-id> task <n>
MSG
```

Types: feat, fix, test, docs, spec, chore, refactor, ci. Scope is the area (approvals, e2e, agents, spec).
One commit per task. Each commit must build and pass tests on its own.
