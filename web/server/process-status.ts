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
      const base = `${table}?select=${config.fields}&order=${config.order}.desc`;
      const filter = `status.in.(queued,pending,running,building,publishing)${ids.length ? `,id.in.(${ids.join(',')})` : ''}`;
      const [recent, active] = await Promise.all([
        db<{ id: string }[]>(`${base}&limit=${config.recent}`),
        db<{ id: string }[]>(`${base}&or=(${filter})&limit=1001`),
      ]);
      if (active.length > 1000)
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
