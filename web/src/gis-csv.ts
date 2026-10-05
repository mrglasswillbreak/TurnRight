import type { DatasetSchema, FieldValue } from './gis-types.js';
import { validField, validDate } from './gis-contracts.js';

/** RFC 4180 quoting, including embedded newlines. Never interpret spreadsheet formulas. */
export function parseDatasetCsv(csv: string): {
  schema: DatasetSchema;
  rows: Record<string, FieldValue>[];
} {
  if (typeof csv !== 'string' || csv.length > 2_500_000)
    throw Error('CSV must be at most 2.5 MB.');
  const records: string[][] = [];
  let row: string[] = [],
    value = '',
    quoted = false,
    closed = false;
  const cell = () => {
    row.push(value);
    value = '';
    closed = false;
  };
  const record = () => {
    cell();
    if (row.some((v) => v !== '')) records.push(row);
    row = [];
  };
  csv = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') {
        value += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else value += c;
    } else if (c === ',') cell();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && csv[i + 1] === '\n') i++;
      record();
    } else if (c === '"' && !value && !closed) quoted = true;
    else if (closed || c === '"') throw Error('Malformed CSV quoting.');
    else value += c;
    if (value.length > 10000 || row.length > 100 || records.length > 100001)
      throw Error('CSV exceeds field, column, or row limits.');
  }
  if (quoted) throw Error('Unclosed CSV quote.');
  if (value || row.length || closed) record();
  const headers = records.shift();
  if (!headers?.length || !records.length)
    throw Error('Include column headings and at least one row.');
  if (
    new Set(headers).size !== headers.length ||
    headers.some((h) => !h.trim())
  )
    throw Error('Use unique, nonempty column headings.');
  const used = new Set<string>();
  const names = headers.map((h, i) => {
    let name = h
      .trim()
      .replace(/[^A-Za-z0-9_]/g, '_')
      .slice(0, 55);
    if (!validField(name)) name = 'field_' + i;
    while (used.has(name)) name += '_' + i;
    used.add(name);
    return name;
  });
  if (records.some((r) => r.length !== headers.length))
    throw Error('Every CSV row must have the same number of columns.');
  const schema: DatasetSchema = {
    version: 1,
    fields: names.map((name, i) => {
      const values = records.map((r) => r[i]).filter((v) => v !== '');
      const type =
        values.length &&
        !/id|code|postal/i.test(headers[i]) &&
        values.every(
          (v) =>
            /^-?(0|[1-9]\d{0,13})(\.\d+)?$/.test(v) &&
            Number.isFinite(Number(v)),
        )
          ? 'number'
          : values.length && values.every((v) => v === 'true' || v === 'false')
            ? 'boolean'
            : values.length && values.every((v) => validDate(v))
              ? 'date'
              : 'text';
      return { name, alias: headers[i], type, public: false };
    }),
  };
  return {
    schema,
    rows: records.map((r) =>
      Object.fromEntries(
        schema.fields.map((f, i) => [
          f.name,
          r[i] === ''
            ? null
            : f.type === 'number'
              ? Number(r[i])
              : f.type === 'boolean'
                ? r[i] === 'true'
                : r[i],
        ]),
      ),
    ),
  };
}

export function csvText(fields: string[], rows: Record<string, unknown>[]) {
  const encode = (v: unknown) => {
    let s = v == null ? '' : String(v);
    if (/^[=+@\-\t\r]/.test(s) && typeof v !== 'number') s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return [
    fields.map(encode).join(','),
    ...rows.map((r) => fields.map((f) => encode(r[f])).join(',')),
  ].join('\r\n');
}
