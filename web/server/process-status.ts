import { db, HttpError } from './backend.js';

const tables = {
  jobs: {
    fields: 'id,kind,status,message,created_at,completed_at',
    recent: 30,
    order: 'created_at',
  },
  releases: {
    fields: 'id,status,summary,created_at,error',
    recent: 20,
    order: 'created_at',
  },
  imports: {
    fields: 'id,source_id,campus_id,status,phase,message,created_at,updated_at',
    recent: 30,
    order: 'updated_at',
  },
};
/** Active work and previously observed work cannot fall out of the recent-history window. */
export async function processStatus(watch: unknown) {
  const known =
    watch && typeof watch === 'object'
      ? (watch as Record<string, unknown>)
      : {};
  const entries = await Promise.all(
    Object.entries(tables).map(async ([kind, config]) => {
      const raw = known[kind];
      if (
        raw !== undefined &&
        (!Array.isArray(raw) ||
          raw.length > 1000 ||
          raw.some(
            (id) => typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id),
          ))
      )
        throw new HttpError(400, 'Invalid monitored process IDs.');
      const ids = (raw || []) as string[];
      const table = kind === 'imports' ? 'campus_imports' : kind;
      const base = `${table}?select=${config.fields}&order=${config.order}.desc,id`;
      const filter = `status.in.(queued,pending,running,building,publishing)${ids.length ? `,id.in.(${ids.join(',')})` : ''}`;
      const [recent, active] = await Promise.all([
        db<{ id: string }[]>(`${base}&limit=${config.recent}`),
        db<{ id: string }[]>(`${base}&or=(${filter})&limit=1000`),
      ]);
      // PostgREST commonly caps responses at 1000 even when limit=1001.
      // Probe the next row so excess work produces an explanation, not silent loss.
      if (
        active.length === 1000 &&
        (
          await db<{ id: string }[]>(
            `${base}&or=(${filter})&limit=1&offset=1000`,
          )
        ).length
      )
        throw new HttpError(
          413,
          'Too many active processes to display. Review stalled jobs before starting more.',
        );
      return [
        kind,
        [
          ...new Map(
            [...recent, ...active].map((row) => [row.id, row]),
          ).values(),
        ],
      ];
    }),
  );
  return Object.fromEntries(entries);
}
