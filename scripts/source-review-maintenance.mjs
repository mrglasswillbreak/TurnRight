import { db } from './cloud.mjs';
// Each call commits at most 100 metadata records or removes 1,000 expired
// bookkeeping rows. No source records, review decisions or files are removed.
for (let n = 0; n < 3000; n++) {
  const remaining = await db('rpc/backfill_source_reviews', 'POST', {});
  if (!remaining) break;
  if (n === 2999) throw Error('Metadata backfill needs another maintenance run.');
}
let removed = 0;
for (let n = 0; n < 100; n++) {
  const count = await db('rpc/cleanup_source_reviews', 'POST', {});
  removed += count;
  if (count < 1000) break;
}
console.log(`Source review index ready; removed ${removed} expired selection/result rows.`);
