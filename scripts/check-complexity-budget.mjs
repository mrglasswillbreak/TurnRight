import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const budgetPath = path.join(root, 'web', 'complexity-budgets.json');

const budgets = JSON.parse(await readFile(budgetPath, 'utf8'));

let hasError = false;

for (const [relativePath, limit] of Object.entries(budgets)) {
  const absolutePath = path.join(root, relativePath);
  const content = await readFile(absolutePath, 'utf8');
  const lineCount = content.split('\n').length;
  if (lineCount > limit) {
    hasError = true;
    console.error(`Complexity budget exceeded: ${relativePath} has ${lineCount} lines (limit ${limit}).`);
  } else {
    console.log(`OK: ${relativePath} has ${lineCount} lines (limit ${limit}).`);
  }
}

if (hasError) {
  process.exit(1);
}
