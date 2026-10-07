import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const listed = execFileSync(
  'git',
  ['ls-files', '--modified', '--others', '--exclude-standard'],
  { cwd: root, encoding: 'utf8' },
)
  .split(/\r?\n/)
  .filter((p) => p.endsWith('.md'));
const files = [
  ...new Set([
    'README.md',
    'CONTRIBUTING.md',
    ...[
      'README',
      'EDITOR',
      'EDITOR-LAYOUT',
      'REDESIGN-VERIFICATION',
      'DEPLOYMENT',
      'EDITOR-RELIABILITY',
      'ARCHITECTURE',
      'BRAND',
      'SCREENSHOTS',
      'GIS-PLATFORM',
      'CAMPUS-GLOBE',
      'CAMPUS-IMPORTS',
      'PHOTO-EDITING',
      'PROGRESS-MONITOR',
      'UNIFIED-MODEL-EDITOR',
    ].map((name) => `docs/${name}.md`),
    'docs/assets/screenshots/README.md',
    ...listed,
  ]),
];
let checked = 0;
const errors = [];
for (const file of files) {
  const text = readFileSync(resolve(root, file), 'utf8');
  const links = [...text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
  links.push(
    ...[...text.matchAll(/(?:src|srcset)="([^"]+)"/g)].map((m) => m[1]),
  );
  for (let link of links) {
    link = link.replace(/^<|>$/g, '').split(/\s+"/)[0];
    if (/^(?:https?:|mailto:|data:|app:)/.test(link)) continue;
    const [path, anchor] = link.split('#');
    const actual = path
      ? resolve(dirname(resolve(root, file)), decodeURIComponent(path))
      : resolve(root, file);
    checked++;
    if (!existsSync(actual)) {
      errors.push(`${file}: missing ${link}`);
      continue;
    }
    if (anchor && actual.endsWith('.md')) {
      const headings = [
        ...readFileSync(actual, 'utf8').matchAll(/^#{1,6} (.+)$/gm),
      ].map((m) =>
        m[1]
          .toLowerCase()
          .replace(/<[^>]*>/g, '')
          .replace(/[^\p{L}\p{N}_ -]/gu, '')
          .replace(/ /g, '-'),
      );
      if (!headings.includes(decodeURIComponent(anchor)))
        errors.push(`${file}: missing heading ${link}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `Validated ${checked} relative links/assets in ${files.length} current or changed guides.`,
  );
