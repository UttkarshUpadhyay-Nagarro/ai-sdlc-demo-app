#!/usr/bin/env node
// PostToolUse hook (matcher: Edit|Write|MultiEdit). After an agent edits a .cs file, runs
// `dotnet format whitespace` on that file so every AI edit lands in the same layout as
// hand-written code. Never blocks: formatting problems are reported, not fatal.
const { spawnSync } = require('child_process');
const path = require('path');

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { buffer += chunk; });
process.stdin.on('end', () => {
  let event = {};
  try { event = JSON.parse(buffer || '{}'); } catch { process.exit(0); }
  const filePath = event.tool_input && event.tool_input.file_path;
  if (!filePath || !filePath.endsWith('.cs')) process.exit(0);

  const projectDir = process.env.CLAUDE_PROJECT_DIR || event.cwd || process.cwd();
  const solution = path.join(projectDir, 'backend', 'InvoiceApp.sln');
  const result = spawnSync('dotnet', ['format', 'whitespace', solution, '--include', filePath], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    process.stderr.write(`dotnet format failed for ${filePath}: ${result.stderr || result.stdout}\n`);
  }
  process.exit(0);
});
