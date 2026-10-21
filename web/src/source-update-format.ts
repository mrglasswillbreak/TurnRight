import { type SourcePage } from './source-updates';
export const date = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : 'Not checked yet';

export const valueText = (value: unknown) =>
  value === undefined
    ? 'Not recorded'
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);

export const emptyPage: SourcePage = { rows: [], total: 0, nextCursor: null };
