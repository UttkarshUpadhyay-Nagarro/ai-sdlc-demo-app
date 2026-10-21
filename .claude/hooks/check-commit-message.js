#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). Blocks `git commit` calls whose message does not follow
// the repo format from AGENTS.md, and blocks --no-verify. Exit code 2 = block, and the
// stderr text is fed back to the agent so it can fix the message and retry.
const COMMIT_SUBJECT = /^(feat|fix|test|docs|spec|chore|refactor|ci)(\([a-z0-9-]+\))?: .{5,72}$/m;

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { buffer += chunk; });
process.stdin.on('end', () => {
  let event = {};
  try { event = JSON.parse(buffer || '{}'); } catch { process.exit(0); }
  const command = (event.tool_input && event.tool_input.command) || '';
  if (!/\bgit\b[^\n]*\bcommit\b/.test(command)) process.exit(0);

  const problems = [];
  if (/--no-verify|\s-n\s/.test(command)) problems.push('Do not skip hooks with --no-verify.');
  if (!/--amend/.test(command) || /-m|-F|<<|--message/.test(command)) {
    if (!COMMIT_SUBJECT.test(command)) problems.push('Subject must be `<type>(<scope>): <summary>` with type one of feat|fix|test|docs|spec|chore|refactor|ci.');
    if (!/^What:/m.test(command)) problems.push('Body must contain a `What:` paragraph saying what changed.');
    if (!/^Why:/m.test(command)) problems.push('Body must contain a `Why:` paragraph saying why it changed.');
  }

  if (problems.length > 0) {
    process.stderr.write(`Commit blocked by .claude/hooks/check-commit-message.js:\n- ${problems.join('\n- ')}\nUse a heredoc: git commit -F - <<'MSG' ... MSG\n`);
    process.exit(2);
  }
  process.exit(0);
});
