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
  // No shell: arguments are passed as-is, so spaces or metacharacters in paths are safe.
  const executable = process.platform === 'win32' ? 'dotnet.exe' : 'dotnet';
  const result = spawnSync(executable, ['format', 'whitespace', solution, '--include', filePath], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    // Exit 1 shows the message to the user without blocking the agent.
    const detail = result.error ? result.error.message : (result.stderr || result.stdout);
    process.stderr.write(`dotnet format did not run for ${filePath}: ${detail}\n`);
    process.exit(1);
  }
  process.exit(0);
});
