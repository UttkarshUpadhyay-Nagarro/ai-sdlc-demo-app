#!/usr/bin/env node
// SubagentStop hook. When the code-reviewer sub-agent finishes, checks its final message
// uses the finding format from AGENTS.md ("### F<n>:" blocks with Severity, File, Rule,
// Problem, Suggested fix). If not, returns decision=block so the agent rewrites it.
const fs = require('fs');

const REQUIRED_FIELDS = ['Severity:', 'File:', 'Rule:', 'Problem:', 'Suggested fix:'];

function lastAssistantText(event) {
  if (event.last_assistant_message) return event.last_assistant_message;
  const transcript = event.agent_transcript_path || event.transcript_path;
  if (!transcript || !fs.existsSync(transcript)) return '';
  const lines = fs.readFileSync(transcript, 'utf8').trim().split('\n').reverse();
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const content = entry.message && entry.message.role === 'assistant' && entry.message.content;
      if (Array.isArray(content)) {
        const text = content.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
        if (text) return text;
      }
    } catch { /* skip malformed lines */ }
  }
  return '';
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { buffer += chunk; });
process.stdin.on('end', () => {
  let event = {};
  try { event = JSON.parse(buffer || '{}'); } catch { process.exit(0); }
  if (event.stop_hook_active) process.exit(0); // never loop
  if (event.agent_type && event.agent_type !== 'code-reviewer') process.exit(0);

  const text = lastAssistantText(event);
  if (!/^## Review of /m.test(text)) process.exit(0); // not a review

  const findings = text.split(/^### F\d+:/m).slice(1);
  const broken = findings
    .map((block, index) => ({ index: index + 1, missing: REQUIRED_FIELDS.filter((field) => !block.includes(field)) }))
    .filter((finding) => finding.missing.length > 0);
  const hasNoFindingsLine = /No findings\./.test(text);

  if (findings.length === 0 && !hasNoFindingsLine) {
    process.stdout.write(JSON.stringify({ decision: 'block', reason: 'Review has no "### F<n>:" findings and no "No findings." line. Rewrite it in the AGENTS.md review format.' }));
  } else if (broken.length > 0) {
    const detail = broken.map((finding) => `F${finding.index} missing ${finding.missing.join(', ')}`).join('; ');
    process.stdout.write(JSON.stringify({ decision: 'block', reason: `Review findings are not in the AGENTS.md format: ${detail}. Rewrite them.` }));
  }
  process.exit(0);
});
