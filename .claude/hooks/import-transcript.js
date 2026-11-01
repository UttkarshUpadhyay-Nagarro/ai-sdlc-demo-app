#!/usr/bin/env node
// Backfills logs/ai-interactions.jsonl from Claude Code session transcripts, using the same
// record shape as log-interaction.js. Needed for the session that created the hooks: hooks
// added mid-session only start firing in the next session, so its early turns would
// otherwise be missing from the log. Records already present are not duplicated.
//   node .claude/hooks/import-transcript.js <session.jsonl> [subagent.jsonl#agent-name ...]
// A `#name` suffix labels the records of that transcript with the sub-agent's role.
const fs = require('fs');
const path = require('path');

const MAX_TEXT = 2000;

// Same redaction as log-interaction.js: the log is committed, secrets must not be.
const SECRET_PATTERNS = [
  [/(\\?"?password\\?"?\s*[:=]\s*\\?"?)[^"\\\s,}]+/gi, '$1***'],
  [/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/g, '$1***'],
  [/((?:token|secret|api[_-]?key)\\?"?\s*[:=]\s*\\?"?)[A-Za-z0-9._~+/-]{8,}/gi, '$1***'],
  [/ChangeMe123!?/g, '***'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>'],
];

// The committer's own address and its local part (handle) are masked too.
const OWN_EMAIL_PARTS = (() => {
  try {
    const email = require('child_process').execSync('git config user.email', { encoding: 'utf8' }).trim();
    return email ? [email, email.split('@')[0]].filter((part) => part.length >= 4) : [];
  } catch {
    return [];
  }
})();

function redact(text) {
  const masked = SECRET_PATTERNS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
  return OWN_EMAIL_PARTS.reduce((result, part) => result.split(part).join('<user>'), masked);
}

function truncate(value) {
  if (value === undefined || value === null) return null;
  const text = redact(typeof value === 'string' ? value : JSON.stringify(value));
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}... [truncated ${text.length - MAX_TEXT} chars]` : text;
}

function summariseInput(input) {
  if (input.file_path) return { file_path: input.file_path };
  if (input.command) return { command: truncate(input.command), description: input.description };
  if (input.prompt) return { subagent_type: input.subagent_type, description: input.description, prompt: truncate(input.prompt) };
  return { raw: truncate(input) };
}

// Harness and IDE context blocks are not part of the conversation (and can carry account details).
function stripContext(text) {
  return text.replace(/<(system-reminder|ide_[a-z_]+)>[\s\S]*?<\/\1>/g, '').trim();
}

function recordsFrom(argument) {
  const [file, label] = argument.split('#');
  const agent = label || (/agent-|subagents/.test(file) ? 'subagent' : 'main');
  const records = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const message = entry.message;
    if (!message || !entry.timestamp || entry.isMeta) continue;
    const base = { timestamp: entry.timestamp, session_id: entry.sessionId || null, agent, imported: true };
    const parts = Array.isArray(message.content) ? message.content : [{ type: 'text', text: message.content }];
    for (const part of parts) {
      if (message.role === 'user' && part.type === 'text' && part.text && stripContext(part.text)) {
        records.push({ ...base, event: 'UserPromptSubmit', tool: null, prompt: truncate(stripContext(part.text)), input: null, outcome: null });
      } else if (message.role === 'assistant' && part.type === 'tool_use') {
        records.push({ ...base, event: 'PreToolUse', tool: part.name, prompt: null, input: summariseInput(part.input || {}), outcome: null });
      } else if (message.role === 'user' && part.type === 'tool_result') {
        const detail = Array.isArray(part.content) ? part.content.map((item) => item.text || '').join('\n') : part.content;
        records.push({ ...base, event: 'PostToolUse', tool: null, prompt: null, input: null, outcome: { status: part.is_error ? 'error' : 'ok', detail: truncate(detail) } });
      } else if (message.role === 'assistant' && part.type === 'text' && part.text && part.text.trim()) {
        records.push({ ...base, event: 'AssistantMessage', tool: null, prompt: null, input: null, outcome: { status: 'ok', detail: truncate(part.text) } });
      }
    }
  }
  return records;
}

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const target = path.join(projectDir, 'logs', 'ai-interactions.jsonl');
fs.mkdirSync(path.dirname(target), { recursive: true });

const existing = fs.existsSync(target)
  ? fs.readFileSync(target, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
  : [];
const keyOf = (record) => `${record.timestamp}|${record.event}|${record.tool}|${(record.prompt || '').slice(0, 40)}`;
const seen = new Set(existing.map(keyOf));
const added = [];

for (const file of process.argv.slice(2)) {
  for (const record of recordsFrom(file)) {
    const key = keyOf(record);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(record);
  }
}

const merged = [...existing, ...added].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
fs.writeFileSync(target, merged.map((record) => JSON.stringify(record)).join('\n') + '\n');
console.log(`Imported ${added.length} records into ${target} (${merged.length} total).`);
