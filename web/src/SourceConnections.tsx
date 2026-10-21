import { Button } from '@/components/ui/button';
import { api } from './supabase';
import { requestedCampus } from './campus-context';
import { date } from './source-update-format';
import type { SourceUpdatesState } from './useSourceUpdates';

export function SourceConnections({ state }: { state: SourceUpdatesState }) {
  const {
    overview,
    changeFilter,
    disabled,
    work,
    setNotice,
    refresh,
    onImports,
    canManage,
    working,
    action,
  } = state;

  return (
    <details className="source-connected">
      <summary>Connected sources · {overview?.sources.length || 0}</summary>
      {overview?.sources.map((source) => (
        <article key={source.id} className="source-status-card">
          <button
            className="source-name"
            onClick={() => changeFilter('source', 'import:' + source.id)}
          >
            {source.name}
          </button>
          <p>
            {overview.counts['import:' + source.id] || 0} pending ·{' '}
            {source.kind === 'file'
              ? 'Uploaded file'
              : source.schedule === 'daily'
                ? 'Daily checks'
                : 'Manual checks'}
          </p>
          <small>Last successful check: {date(source.lastSuccess)}</small>
          <p
            className={
              source.latest?.status === 'failed' ? 'form-error' : 'small-note'
            }
          >
            {source.active?.message ||
              source.latest?.message ||
              'Ready for a source check'}
          </p>
          <div className="source-inline-actions">
            {source.kind !== 'file' ? (
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || !!source.active}
                onClick={() =>
                  void work(async () => {
                    await api('source-updates-check', {
                      sourceId: source.id,
                    });
                    setNotice(
                      'Source check queued; new proposals will appear here.',
                    );
                    refresh();
                  })
                }
              >
                {source.active ? 'Check running' : 'Check now'}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={onImports}>
                Replace file
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onImports}>
              {source.configured ? 'Import setup' : 'Finish setup'}
            </Button>
          </div>
          {source.kind !== 'file' && (
            <label className="source-schedule">
              Schedule for {source.name}
              <select
                value={source.schedule}
                disabled={!canManage || working}
                onChange={(e) => {
                  const schedule = e.target.value;
                  void work(async () => {
                    await api('source-schedule', {
                      sourceId: source.id,
                      schedule,
                    });
                    refresh();
                  });
                }}
              >
                <option value="manual">Manual checks</option>
                <option
                  value="daily"
                  disabled={
                    source.kind === 'osm' && !overview.scheduledOsmEnabled
                  }
                >
                  Daily review checks
                </option>
              </select>
            </label>
          )}
          {source.kind === 'osm' && !overview.scheduledOsmEnabled && (
            <small>
              Daily OSM checks need a configured endpoint that permits scheduled
              downloads. Manual checks are available.
            </small>
          )}
        </article>
      ))}
      {requestedCampus() === 'lasu' && (
        <article className="source-status-card">
          <strong>LASU shared source check</strong>
          <p>Daily checks for the existing OSM and ArcGIS sources.</p>
          <small>Latest check: {date(overview?.legacy?.created_at)}</small>
          <p>{overview?.legacy?.message || 'No check recorded yet'}</p>
          <Button
            size="sm"
            variant="outline"
            disabled={
              disabled ||
              ['queued', 'running'].includes(overview?.legacy?.status || '')
            }
            onClick={() =>
              void work(async () => {
                if (
                  await action('check-sources', {}, 'LASU source check queued.')
                )
                  refresh();
              })
            }
          >
            Check LASU sources
          </Button>
        </article>
      )}
      <Button variant="outline" onClick={onImports}>
        Add or configure a source
      </Button>
    </details>
  );
}
