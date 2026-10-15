import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '../..');
const files = [
  ...new Set(
    execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: root, encoding: 'utf8' },
    ).split('\0'),
  ),
]
  .filter((file) => file.endsWith('.md') && existsSync(resolve(root, file)))
  .sort();
const errors = [];
let checked = 0;
function withoutFences(text) {
  return text.replace(
    /^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[ \t]*$/gm,
    '',
  );
}
function anchors(text) {
  const counts = new Map();
  const found = new Set();
  for (const [, heading] of withoutFences(text).matchAll(
    /^#{1,6}\s+(.+?)\s*#*\s*$/gm,
  )) {
    const slug = heading
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{N}_ -]/gu, '')
      .replace(/ /g, '-');
    const count = counts.get(slug) || 0;
    found.add(count ? slug + '-' + count : slug);
    counts.set(slug, count + 1);
  }
  for (const [, id] of text.matchAll(/(?:id|name)=["']([^"']+)["']/g))
    found.add(id);
  return found;
}
function exactCase(target) {
  const path = relative(root, target);
  if (path.startsWith('..') || path === '') return true;
  let current = root;
  for (const part of path.split(sep)) {
    if (!readdirSync(current).includes(part)) return false;
    current = resolve(current, part);
  }
  return true;
}
const headingCache = new Map();
for (const file of files) {
  const text = withoutFences(readFileSync(resolve(root, file), 'utf8'));
  const links = [
    ...text.matchAll(
      /!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\)/g,
    ),
  ].map((m) => m[1]);
  links.push(
    ...[...text.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/gm)].map((m) => m[1]),
  );
  links.push(
    ...[...text.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((m) => m[1]),
  );
  for (const [, values] of text.matchAll(/srcset=["']([^"']+)["']/g))
    links.push(
      ...values.split(',').map((value) => value.trim().split(/\s/)[0]),
    );
  for (let link of links) {
    link = link.replace(/^<|>$/g, '');
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(link)) continue;
    const [path, anchor] = link.split('#');
    let actual;
    try {
      actual = path
        ? resolve(
            dirname(resolve(root, file)),
            decodeURIComponent(path.split('?')[0]),
          )
        : resolve(root, file);
    } catch {
      errors.push(file + ': invalid URL ' + link);
      continue;
    }
    checked++;
    if (!existsSync(actual)) {
      errors.push(file + ': missing ' + link);
      continue;
    }
    if (!exactCase(actual))
      errors.push(file + ': filename case mismatch ' + link);
    if (anchor && actual.endsWith('.md')) {
      if (!headingCache.has(actual))
        headingCache.set(actual, anchors(readFileSync(actual, 'utf8')));
      if (!headingCache.get(actual).has(decodeURIComponent(anchor)))
        errors.push(file + ': missing heading ' + link);
    }
  }
}
// Current tour manifests are immutable evidence; accidental image replacement fails CI.
const directory = resolve(root, 'docs/assets/screenshots');
let captures = 0;
for (const filename of readdirSync(directory).filter((name) =>
  /^tour-\d{4}-\d{2}-\d{2}\.json$/.test(name),
)) {
  const manifest = JSON.parse(
    readFileSync(resolve(directory, filename), 'utf8'),
  );
  for (const entry of manifest.captures) {
    const target = resolve(directory, entry.file);
    if (!target.startsWith(directory + sep) || !existsSync(target)) {
      errors.push(filename + ': missing/invalid capture ' + entry.file);
      continue;
    }
    const bytes = readFileSync(target);
    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256)
      errors.push(filename + ': changed capture ' + entry.file);
    if (
      bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a' ||
      bytes.readUInt32BE(16) !== entry.width ||
      bytes.readUInt32BE(20) !== entry.height
    )
      errors.push(filename + ': dimensions/format mismatch ' + entry.file);
    captures++;
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `Validated ${checked} local links/assets across all ${files.length} Markdown files and ${captures} recorded tour captures.`,
  );
