import { sourceFieldLabel } from './source-updates';
import type { SourceUpdatesState } from './useSourceUpdates';

export function SourceReviewFilters({ state }: { state: SourceUpdatesState }) {
  const { filters, changeFilter, overview, sourceNames } = state;

  return (
    <div className="source-filter-grid">
      <label>
        Source
        <select
          value={filters.source || ''}
          onChange={(e) => changeFilter('source', e.target.value)}
        >
          <option value="">All sources</option>
          {Object.keys(overview?.counts || {})
            .sort()
            .map((key) => (
              <option key={key} value={key}>
                {sourceNames.get(key) || sourceFieldLabel(key)}
              </option>
            ))}
        </select>
      </label>
      <label>
        Update
        <select
          value={filters.kind || ''}
          onChange={(e) => changeFilter('kind', e.target.value)}
        >
          <option value="">All updates</option>
          <option value="add">Additions</option>
          <option value="modify">Changes</option>
          <option value="remove">Removals</option>
        </select>
      </label>
      <label>
        Layer
        <select
          value={filters.layer || ''}
          onChange={(e) => changeFilter('layer', e.target.value)}
        >
          <option value="">All layers</option>
          {overview?.layers.map((layer) => (
            <option key={layer}>{layer}</option>
          ))}
        </select>
      </label>
      <label>
        Feature type
        <select
          value={filters.featureType || ''}
          onChange={(e) => changeFilter('featureType', e.target.value)}
        >
          <option value="">All features</option>
          {overview?.featureTypes.map((kind) => (
            <option key={kind} value={kind}>
              {sourceFieldLabel(kind)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Changed content
        <select
          value={filters.geometry || ''}
          onChange={(e) => changeFilter('geometry', e.target.value)}
        >
          <option value="">All content</option>
          <option value="true">Shape or location</option>
          <option value="false">Details only</option>
        </select>
      </label>
    </div>
  );
}
