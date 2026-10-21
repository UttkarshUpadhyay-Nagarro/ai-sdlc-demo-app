#!/usr/bin/env node
// Appends one structured line per AI interaction to logs/ai-interactions.jsonl.
// Wired to SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, SubagentStop and Stop
// in .claude/settings.json. Every record has the same shape so the log can be diffed,
// grepped and rendered (see .claude/hooks/render-ai-log.js).
const fs = require('fs');
const path = require('path');

const MAX_TEXT = 2000;

function truncate(value) {
  if (value === undefined || value === null) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}... [truncated ${text.length - MAX_TEXT} chars]` : text;
}

function summariseToolInput(toolName, input) {
  if (!input) return null;
  if (input.file_path) return { file_path: input.file_path };
  if (toolName === 'Bash' || toolName === 'PowerShell') return { command: truncate(input.command), description: input.description };
  if (toolName === 'Agent' || toolName === 'Task') return { subagent_type: input.subagent_type, description: input.description, prompt: truncate(input.prompt) };
  if (toolName === 'Grep' || toolName === 'Glob') return { pattern: input.pattern, path: input.path };
  return { raw: truncate(input) };
}

function main(raw) {
  let event = {};
  try { event = JSON.parse(raw || '{}'); } catch { event = { parse_error: true, raw: truncate(raw) }; }

  const projectDir = process.env.CLAUDE_PROJECT_DIR || event.cwd || process.cwd();
  const logDir = path.join(projectDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });

  const record = {
    timestamp: new Date().toISOString(),
    session_id: event.session_id || null,
    event: event.hook_event_name || 'Unknown',
    agent: event.agent_type || (event.hook_event_name === 'SubagentStop' ? 'subagent' : 'main'),
    tool: event.tool_name || null,
    prompt: truncate(event.prompt),
    input: null,
    outcome: null,
  };

  if (event.tool_input) record.input = summariseToolInput(event.tool_name, event.tool_input);
  if (event.tool_response !== undefined) {
    const response = event.tool_response;
    const failed = response && (response.is_error || response.success === false || response.interrupted);
    record.outcome = { status: failed ? 'error' : 'ok', detail: truncate(response && (response.stdout || response.error || response.message)) };
  }
  if (event.hook_event_name === 'SubagentStop' || event.hook_event_name === 'Stop') {
    record.outcome = { status: 'stopped', detail: truncate(event.last_assistant_message) };
  }
  if (event.hook_event_name === 'SessionStart') {
    record.input = { source: event.source || null, model: event.model || null };
  }

  fs.appendFileSync(path.join(logDir, 'ai-interactions.jsonl'), `${JSON.stringify(record)}\n`);
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { buffer += chunk; });
process.stdin.on('end', () => {
  try { main(buffer); } catch (error) { process.stderr.write(`log-interaction hook failed: ${error.message}\n`); }
  process.exit(0); // logging must never block the agent
});
