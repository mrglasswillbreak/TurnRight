import { describe, expect, it } from 'vitest';
import { sourceReviewQuery } from '../server/source-review-query';

describe('source review pages', () => {
  it('keeps a stable order and requests one extra row for paging', () => {
    expect(sourceReviewQuery()).toBe(
      'map_changes?status=eq.pending&order=created_at.desc,id.asc&limit=301&offset=0',
    );
    expect(
      sourceReviewQuery({
        sourceQuery: 'feature:overture:',
        sourceOffset: 600,
      }),
    ).toContain('&offset=600&source_id=like.feature%3Aoverture%3A*');
  });
  it('does not allow filters to expand the query or skip arbitrary rows', () => {
    for (const sourceQuery of ['*', '%', 'a&status=eq.accepted', 'a,b', 2]) {
      expect(() => sourceReviewQuery({ sourceQuery })).toThrow();
    }
    for (const sourceOffset of [-300, 1, 0.5, '300', 30300]) {
      expect(() => sourceReviewQuery({ sourceOffset })).toThrow();
    }
  });
});
