#!/usr/bin/env node
// Prints a per-file mutation score table from a Stryker mutation-report.json.
//   node docs/mutation/summarise.js <path/to/mutation-report.json>
const fs = require('fs');
const path = require('path');

const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const rows = [];
const totals = { Killed: 0, Timeout: 0, Survived: 0, NoCoverage: 0, Ignored: 0, CompileError: 0 };

for (const [file, data] of Object.entries(report.files)) {
  const counts = { Killed: 0, Timeout: 0, Survived: 0, NoCoverage: 0, Ignored: 0, CompileError: 0 };
  for (const mutant of data.mutants) counts[mutant.status] = (counts[mutant.status] || 0) + 1;
  for (const key of Object.keys(totals)) totals[key] += counts[key] || 0;
  const detected = counts.Killed + counts.Timeout;
  const valid = detected + counts.Survived + counts.NoCoverage;
  if (valid === 0) continue;
  rows.push({ file: path.basename(file), ...counts, score: (100 * detected / valid).toFixed(2) });
}

const detected = totals.Killed + totals.Timeout;
const valid = detected + totals.Survived + totals.NoCoverage;
console.log('File                     | Killed | Survived | NoCoverage | Score');
console.log('-------------------------|--------|----------|------------|-------');
for (const row of rows) {
  console.log(`${row.file.padEnd(25)}| ${String(row.Killed + row.Timeout).padEnd(7)}| ${String(row.Survived).padEnd(9)}| ${String(row.NoCoverage).padEnd(11)}| ${row.score}%`);
}
console.log(`${'TOTAL'.padEnd(25)}| ${String(detected).padEnd(7)}| ${String(totals.Survived).padEnd(9)}| ${String(totals.NoCoverage).padEnd(11)}| ${(100 * detected / valid).toFixed(2)}%`);
