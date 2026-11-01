#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). Blocks `git commit` calls whose message does not follow
// the repo format from AGENTS.md, and blocks skipping hooks. Exit code 2 = block, and the
// stderr text is fed back to the agent so it can fix the message and retry.
// `git commit -F <file>` is left to .githooks/commit-msg, which sees the final message.
const SUBJECT = /^(feat|fix|test|docs|spec|chore|refactor|ci)(\([a-z0-9-]+\))?: .{5,72}$/;
const COMMIT_INVOCATION = /(^|[;&|(]\s*|\n\s*)git(\s+-c\s+\S+)*\s+commit(?=\s|$)([^;&|\n]*)/;

function messageFrom(command, commitArgs) {
  const heredoc = command.match(/<<-?\s*'?(\w+)'?\s*\n([\s\S]*?)\n\s*\1\s*$/m);
  if (heredoc && /(^|\s)(-F|--file)\s*-(\s|$)|-[a-zA-Z]*F\s*-(\s|$)/.test(commitArgs)) return heredoc[2];
  const inline = commitArgs.match(/(?:-m|--message)[\s=]*(["'])([\s\S]*?)\1/);
  return inline ? inline[2] : null;
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { buffer += chunk; });
process.stdin.on('end', () => {
  let event = {};
  try { event = JSON.parse(buffer || '{}'); } catch { process.exit(0); }
  const command = (event.tool_input && event.tool_input.command) || '';
  const invocation = command.match(COMMIT_INVOCATION);
  if (!invocation) process.exit(0);

  const commitArgs = invocation[3] || '';
  const problems = [];
  if (/--no-verify|(^|\s)-[a-zA-Z]*n[a-zA-Z]*(\s|$)/.test(commitArgs)) {
    problems.push('Do not skip hooks (--no-verify / -n).');
  }

  const message = messageFrom(command, commitArgs);
  if (message === null) {
    if (!/--amend\s*(--no-edit)?\s*$/.test(commitArgs.trim()) && !/(^|\s)(-F|--file)\s+[^-\s]/.test(commitArgs)) {
      problems.push('Pass the message inline with a heredoc so it can be checked: git commit -F - <<\'MSG\' ... MSG');
    }
  } else {
    const subject = message.split('\n')[0].trim();
    if (!SUBJECT.test(subject)) problems.push(`Subject must be \`<type>(<scope>): <summary>\` (max 72 chars), type one of feat|fix|test|docs|spec|chore|refactor|ci. Got: "${subject}"`);
    if (!/^What:/m.test(message)) problems.push('Body must contain a `What:` paragraph saying what changed.');
    if (!/^Why:/m.test(message)) problems.push('Body must contain a `Why:` paragraph saying why it changed.');
  }

  if (problems.length > 0) {
    process.stderr.write(`Commit blocked by .claude/hooks/check-commit-message.js:\n- ${problems.join('\n- ')}\n`);
    process.exit(2);
  }
  process.exit(0);
});
