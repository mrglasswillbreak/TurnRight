/** Read-only comparison; retain hashes and changed field paths, never source values. */
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { canonical, db } from './cloud.mjs';

const reviews = [
  ['lasu', '748818c4-7634-4955-ada2-3674b0b9f66b', '56628cea1a199ad72b0d75b7dac50a5114bd349986c6fda251d39cc3b2814edc'],
  ['campus-eedb34e0-0310-47a0-afbf-2d2b7e8d9a2a', 'cabb3184-e1de-47ca-82aa-394ef6fd8f73', '5b76a7633c93e9f216eb30dde6917dad4c0d67bba077abc675d57ed7d5155ecb'],
];
const digest = (value) => createHash('sha256').update(JSON.stringify(canonical(value, true))).digest('hex');
const sections = {
  features: ['source_features', 'id', (row) => row.id],
  edits: ['map_edits', 'kind,id', (row) => `${row.kind}:${row.id}`],
  datasets: ['gis_datasets', 'id', (row) => row.id],
  attributes: ['gis_attributes', 'dataset_id,feature_key', (row) => `${row.dataset_id}:${row.feature_key}`],
  tables: ['gis_table_rows', 'dataset_id,feature_key', (row) => `${row.dataset_id}:${row.feature_key}`],
  issues: ['gis_issues', 'id', (row) => row.id],
  views: ['gis_views', 'id', (row) => row.id],
};
function paths(before, after, prefix = '') {
  if (digest(before ?? null) === digest(after ?? null)) return [];
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object' || Array.isArray(before) || Array.isArray(after)) return [prefix];
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    .flatMap((key) => paths(before[key], after[key], prefix ? `${prefix}.${key}` : key));
}
async function rows(table, order, campus) {
  const result = [];
  for (let offset = 0; offset < 300000; offset += 1000) {
    const query = new URLSearchParams({ select: '*', campus_id: `eq.${campus}`, order, limit: '1000', offset: String(offset) });
    const page = await db(`${table}?${query}`);
    result.push(...page);
    if (page.length < 1000) return result;
  }
  throw Error('Review audit exceeded its row bound');
}
const report = { recordedAt: new Date().toISOString(), revision: process.env.GITHUB_SHA, readOnly: true, valuesRedacted: true, campuses: [] };
for (const [campus, id, expected] of reviews) {
  process.env.CAMPUS_ID = campus;
  const [review] = await db(`gis_reviews?id=eq.${id}&select=id,content_hash,snapshot,created_at,status`);
  if (!review || review.content_hash !== expected) throw Error('Unexpected immutable review identity');
  const beforeHash = await db('rpc/gis_workspace_content_hash', 'POST', {}, undefined, 120000);
  const record = { campus, reviewId: id, approvedHash: expected, status: review.status, currentHash: beforeHash, sections: {}, events: [] };
  for (const [section, [table, order, identity]] of Object.entries(sections)) {
    const current = await rows(table, order, campus);
    if (section === 'features') current.forEach((row) => delete row.gis_feature_key);
    const original = review.snapshot[section] ?? [];
    const old = new Map(original.map((row) => [identity(row), row]));
    const next = new Map(current.map((row) => [identity(row), row]));
    const differences = [...new Set([...old.keys(), ...next.keys()])].flatMap((key) => {
      const a = old.get(key), b = next.get(key);
      return digest(a ?? null) === digest(b ?? null) ? [] : [{ id: key, kind: !a ? 'added' : !b ? 'removed' : 'changed', fields: paths(a, b), beforeHash: digest(a ?? null), afterHash: digest(b ?? null) }];
    });
    record.sections[section] = { beforeCount: original.length, currentCount: current.length, changed: differences.length, differences: differences.slice(0, 200), truncated: differences.length > 200 };
  }
  record.events = await db(`workspace_audit?select=action,subject,created_at&created_at=gt.${encodeURIComponent(review.created_at)}&order=created_at.desc&limit=100`);
  const afterHash = await db('rpc/gis_workspace_content_hash', 'POST', {}, undefined, 120000);
  if (afterHash !== beforeHash) throw Error('Workspace changed during read-only comparison; rerun');
  record.matchesApproved = beforeHash === expected;
  report.campuses.push(record);
  console.log(JSON.stringify({ campus, matchesApproved: record.matchesApproved, changes: Object.fromEntries(Object.entries(record.sections).map(([key,value]) => [key,value.changed])) }));
}
await mkdir('web/work/release-readiness', { recursive: true });
await writeFile('web/work/release-readiness/review-drift.json', JSON.stringify(report, null, 2) + '\n');
