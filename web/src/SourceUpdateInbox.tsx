import { Check, ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WorkspacePane } from './WorkspaceFrame';
import { AdminRequestError } from './admin-client';
import {
  describeSourceChange,
  sourceFieldLabel,
  sourceChangeLabel,
} from './source-updates';
import SourceRecovery from './SourceRecovery';
import type { SourceUpdatesState } from './useSourceUpdates';
import { SourceConnections } from './SourceConnections';
import { SourceReviewFilters } from './SourceReviewFilters';
import { SourceDecisionDialog } from './SourceDecisionDialog';
import { SourceDecisionHistory } from './SourceDecisionHistory';
export function SourceUpdateInbox({ state }: { state: SourceUpdatesState }) {
  const {
    refresh,
    working,
    error,
    onSignIn,
    notice,
    page,
    mapPreview,
    setMapPreview,
    setFocusId,
    onFocus,
    reveal,
    overview,
    filters,
    changeFilter,
    allMatching,
    selectedPage,
    disabled,
    loading,
    setSelected,
    setAllMatching,
    count,
    setPrepared,
    cursors,
    focusId,
    selected,
    setCursors,
    active,
    prepare,
    canEdit,
    onRefresh,
    extras,
  } = state;

  return (
    <WorkspacePane id="left" title="Source updates" className="source-updates">
      <header className="source-updates-heading">
        <div>
          <span className="editor-eyebrow">KEEP YOUR CAMPUS CURRENT</span>
          <h2>Source updates</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={working}
          aria-label="Refresh source updates"
        >
          <RefreshCw />
        </Button>
      </header>
      <p className="small-note">
        Check sources → review changes → publish. Your saved campus corrections
        take precedence.
      </p>
      {error && (
        <div role="alert" className="form-error">
          {error.message}{' '}
          <button
            onClick={() =>
              error instanceof AdminRequestError && error.reason === 'auth'
                ? void onSignIn()
                : refresh()
            }
          >
            {error instanceof AdminRequestError && error.reason === 'auth'
              ? 'Sign in again'
              : 'Refresh status'}
          </button>
        </div>
      )}
      {notice && <output className="notice">{notice}</output>}
      <SourceConnections state={state} />
      <div className="source-inbox-heading">
        <h3>Review inbox</h3>
        <span>{page.total.toLocaleString()} pending</span>
      </div>
      <Button
        variant="outline"
        aria-pressed={mapPreview}
        className="source-preview-launch"
        onClick={() => {
          setMapPreview(!mapPreview);
          if (!mapPreview) {
            setFocusId('');
            onFocus(null);
            if (innerWidth < 1200) reveal?.('map');
          }
        }}
      >
        {mapPreview
          ? 'Hide map preview'
          : 'Preview all matching changes on map'}
      </Button>
      {overview && !overview.ready && (
        <p className="notice">
          Preparing the source update index. Review will be available shortly.
        </p>
      )}
      <label>
        Find an update
        <input
          placeholder="Name, layer, or feature ID"
          value={filters.query || ''}
          onChange={(e) => changeFilter('query', e.target.value)}
          maxLength={200}
        />
      </label>
      <SourceReviewFilters state={state} />
      <div className="source-selection" aria-label="Source update selection">
        <label>
          <input
            type="checkbox"
            checked={allMatching || selectedPage}
            disabled={disabled || loading || !page.rows.length || allMatching}
            onChange={(e) => {
              const checked = e.target.checked;
              setSelected((old) => {
                const next = { ...old };
                for (const row of page.rows) {
                  if (checked) next[row.id] = row.revision;
                  else delete next[row.id];
                }
                return next;
              });
            }}
          />
          Select this page
        </label>
        <button
          disabled={disabled || loading || !page.total}
          onClick={() => {
            setAllMatching(true);
            setSelected({});
          }}
        >
          Select all {page.total.toLocaleString()} matching results
        </button>
        {!!count && (
          <button
            onClick={() => {
              setAllMatching(false);
              setSelected({});
              setPrepared(undefined);
            }}
          >
            Clear selection
          </button>
        )}
      </div>
      <p className="small-note" aria-live="polite">
        {loading
          ? 'Loading updates…'
          : `Page ${cursors.length} · ${page.rows.length} shown · ${count.toLocaleString()} selected`}
      </p>
      <div
        className="source-update-list"
        aria-label="Pending source updates"
        aria-busy={loading}
      >
        {!loading && !page.rows.length && (
          <div className="empty-state">
            <h3>No matching updates</h3>
            <p>
              Change the filters, check your sources, or return to the previous
              page.
            </p>
          </div>
        )}
        {page.rows.map((row) => (
          <article
            key={row.id}
            className={`source-update-row ${focusId === row.id ? 'selected' : ''}`}
          >
            <input
              type="checkbox"
              aria-label={`Select ${row.meta.name}`}
              checked={allMatching || selected[row.id] === row.revision}
              disabled={disabled || allMatching}
              onChange={(e) => {
                const checked = e.target.checked;
                setSelected((old) => {
                  const next = { ...old };
                  if (checked) next[row.id] = row.revision;
                  else delete next[row.id];
                  return next;
                });
              }}
            />
            <button
              onClick={() => {
                setFocusId(row.id);
              }}
              aria-label={`Review ${row.meta.name}`}
            >
              <span className={`source-kind ${row.kind}`}>
                {sourceChangeLabel(row.kind, row.reliability)}
              </span>
              <strong>
                {row.meta.featureType === 'edge' && 'Routing segment · '}
                {row.meta.name}
              </strong>
              <span>{describeSourceChange(row)}</span>
              <small>
                {row.reliability?.eligible === false
                  ? row.reliability.verification === 'unverified'
                    ? 'Needs verification'
                    : 'Blocked'
                  : 'Ready to review'}
                {row.reliability?.dependencyCount
                  ? ` · ${row.reliability.dependencyCount} dependent records`
                  : ''}
              </small>
              <small>
                {row.sourceName} ·{' '}
                {row.meta.layer || sourceFieldLabel(row.meta.featureType)}
              </small>
            </button>
          </article>
        ))}
      </div>
      <div className="source-pagination">
        <Button
          size="sm"
          variant="outline"
          disabled={loading || cursors.length === 1}
          onClick={() => setCursors((old) => old.slice(0, -1))}
        >
          <ChevronLeft /> Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={loading || !page.nextCursor}
          onClick={() =>
            page.nextCursor && setCursors((old) => [...old, page.nextCursor])
          }
        >
          Next <ChevronRight />
        </Button>
      </div>
      <div className="source-bulk-bar">
        <strong>{count.toLocaleString()} selected</strong>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || !count || !!active}
          onClick={() => void prepare(false)}
        >
          <X /> Reject selected
        </Button>
        <Button
          size="sm"
          disabled={disabled || !count || !!active}
          onClick={() => void prepare(true)}
        >
          <Check /> Accept selected
        </Button>
      </div>
      {!!page.excludedTotal && (
        <p className="notice">
          {page.excludedTotal} blocked or unverified groups are excluded from
          bulk acceptance. They remain available to inspect or reject.
        </p>
      )}
      <SourceRecovery
        canEdit={canEdit && !disabled && !active}
        onRefresh={onRefresh}
      />
      {active && (
        <p className="notice">
          A bulk review is running. You can inspect updates while it finishes.
        </p>
      )}
      <SourceDecisionDialog state={state} />
      {extras && (
        <details>
          <summary>Campus enrichment and building evidence</summary>
          {extras}
        </details>
      )}
      <SourceDecisionHistory state={state} />
    </WorkspacePane>
  );
}
