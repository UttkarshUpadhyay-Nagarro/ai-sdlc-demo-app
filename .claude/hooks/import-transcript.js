#!/usr/bin/env node
// Backfills logs/ai-interactions.jsonl from Claude Code session transcripts, using the same
// record shape as log-interaction.js. Needed for the session that created the hooks: hooks
// added mid-session only start firing in the next session, so its early turns would
// otherwise be missing from the log. Records already present are not duplicated.
//   node .claude/hooks/import-transcript.js <session.jsonl> [subagent.jsonl ...]
const fs = require('fs');
const path = require('path');

const MAX_TEXT = 2000;

function truncate(value) {
  if (value === undefined || value === null) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}... [truncated ${text.length - MAX_TEXT} chars]` : text;
}

function summariseInput(input) {
  if (input.file_path) return { file_path: input.file_path };
  if (input.command) return { command: truncate(input.command), description: input.description };
  if (input.prompt) return { subagent_type: input.subagent_type, description: input.description, prompt: truncate(input.prompt) };
  return { raw: truncate(input) };
}

function recordsFrom(file) {
  const agent = /agent-|subagents/.test(file) ? 'subagent' : 'main';
  const records = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const message = entry.message;
    if (!message || !entry.timestamp || entry.isMeta) continue;
    const base = { timestamp: entry.timestamp, session_id: entry.sessionId || null, agent, imported: true };
    const parts = Array.isArray(message.content) ? message.content : [{ type: 'text', text: message.content }];
    for (const part of parts) {
      if (message.role === 'user' && part.type === 'text' && part.text) {
        records.push({ ...base, event: 'UserPromptSubmit', tool: null, prompt: truncate(part.text), input: null, outcome: null });
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
