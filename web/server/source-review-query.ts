export const SOURCE_REVIEW_PAGE_SIZE = 300;

/** A bounded, stable page; source IDs are literal prefixes, never query syntax. */
export function sourceReviewQuery(
  payload: {
    sourceQuery?: unknown;
    sourceOffset?: unknown;
  } = {},
) {
  const query = payload.sourceQuery ?? '';
  const offset = payload.sourceOffset ?? 0;
  if (
    typeof query !== 'string' ||
    query.length > 160 ||
    !/^[a-zA-Z0-9:_./-]*$/.test(query) ||
    typeof offset !== 'number' ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 30000 ||
    offset % SOURCE_REVIEW_PAGE_SIZE !== 0
  )
    throw new Error('Choose a source ID prefix and a valid review page.');
  return (
    `map_changes?status=eq.pending&order=created_at.desc,id.asc&limit=${SOURCE_REVIEW_PAGE_SIZE + 1}&offset=${offset}` +
    (query ? `&source_id=like.${encodeURIComponent(query)}*` : '')
  );
}
