#!/usr/bin/env node
// Renders logs/ai-interactions.jsonl as logs/ai-interactions.md (one table row per record).
// Run by the Stop hook so the human-readable log is always current, or by hand:
//   node .claude/hooks/render-ai-log.js
const fs = require('fs');
const path = require('path');

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const source = path.join(projectDir, 'logs', 'ai-interactions.jsonl');
const target = path.join(projectDir, 'logs', 'ai-interactions.md');

function cell(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>').slice(0, 400);
}

function render() {
  if (!fs.existsSync(source)) return;
  const records = fs.readFileSync(source, 'utf8').split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);

  const counts = {};
  for (const record of records) counts[record.event] = (counts[record.event] || 0) + 1;

  const lines = [
    '# AI interaction log',
    '',
    `Generated from \`logs/ai-interactions.jsonl\` (${records.length} records). Do not edit by hand.`,
    '',
    '| Event | Count |',
    '| --- | --- |',
    ...Object.entries(counts).map(([event, count]) => `| ${event} | ${count} |`),
    '',
    '| # | Time (UTC) | Event | Agent | Tool | Prompt / input | Outcome |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...records.map((record, index) => {
      const outcome = record.outcome ? `${record.outcome.status}: ${record.outcome.detail || ''}` : '';
      return `| ${index + 1} | ${cell(record.timestamp)} | ${cell(record.event)} | ${cell(record.agent)} | ${cell(record.tool)} | ${cell(record.prompt || record.input)} | ${cell(outcome)} |`;
    }),
    '',
  ];
  fs.writeFileSync(target, lines.join('\n'));
}

if (process.stdin.isTTY) {
  render();
} else {
  process.stdin.on('data', () => {});
  process.stdin.on('end', () => {
    try { render(); } catch (error) { process.stderr.write(`render-ai-log failed: ${error.message}\n`); }
    process.exit(0);
  });
}
