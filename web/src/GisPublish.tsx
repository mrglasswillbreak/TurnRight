import { WorkspacePane } from './WorkspaceFrame';
import { useEffect, useState } from 'react';
import type { GisPanelProps } from './GisWorkspace';
import type { ReviewSubmission, SavedMapView } from './gis-types';
import { api } from './supabase';
import { gisApi } from './gis-api';
import { requestedCampus } from './campus-context';
import { showGisPage } from './gis-map';
import { downloadLayout, printLayout, renderMapLayout } from './gis-layout';
interface Release {
  id: string;
  summary: string;
  status: string;
  preview_url?: string;
  deployment_url?: string;
  error?: string;
  version?: string;
  review_id?: string;
}
export default function GisPublish({
  datasets,
  capabilities,
  map,
  mutate,
}: GisPanelProps) {
  const [reviews, setReviews] = useState<ReviewSubmission[]>([]),
    [releases, setReleases] = useState<Release[]>([]),
    [id, setId] = useState(''),
    [summary, setSummary] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [title, setTitle] = useState('Campus map'),
    [paper, setPaper] = useState<'A4' | 'A3'>('A4'),
    [attribution, setAttribution] = useState(
      '© OpenStreetMap contributors · Campus source attribution applies',
    ),
    [viewName, setViewName] = useState(''),
    [views, setViews] = useState<SavedMapView[]>([]),
    [visible, setVisible] = useState<string[]>([]),
    [mapNotice, setMapNotice] = useState(''),
    [mapComplete, setMapComplete] = useState(false);
  const canPublish = capabilities.capabilities.includes('publish');
  const load = async () => {
    const [r, s, v] = await Promise.all([
      gisApi('gis-reviews', {}),
      api<{ releases: Release[] }>('review-status'),
      gisApi('gis-views', {}),
    ]);
    setReviews(r.filter((r) => r.status === 'approved'));
    setReleases(s.releases);
    setViews(v);
  };
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    const timer = setInterval(
      () => void load().catch((e) => setError(e.message)),
      15000,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!map) return;
    let sequence = 0,
      disposed = false;
    let cleanups: (() => void)[] = [];
    const update = async () => {
      setMapComplete(false);
      const current = ++sequence,
        b = map.getBounds();
      try {
        const results = await Promise.all(
          visible.map(async (id) => {
            const d = datasets.find((d) => d.id === id)!;
            return {
              d,
              page: await gisApi('gis-query', {
                datasetId: id,
                revision: d.revision,
                limit: 500,
                bbox: [
                  Math.max(-180, b.getWest()),
                  Math.max(-90, b.getSouth()),
                  Math.min(180, b.getEast()),
                  Math.min(90, b.getNorth()),
                ],
              }),
            };
          }),
        );
        if (disposed || current !== sequence) return;
        cleanups.forEach((fn) => fn());
        cleanups = results.map(({ d, page }) =>
          showGisPage(
            map,
            d,
            page.features,
            new Set(),
            () => {},
            'layout-' + d.id,
          ),
        );
        setMapComplete(!results.some((r) => r.page.nextCursor));
        setMapNotice(
          results.some((r) => r.page.nextCursor)
            ? 'Some layers exceed 500 visible features. Zoom in for a complete layout.'
            : 'All queried features in this extent are displayed.',
        );
      } catch (e) {
        if (!disposed) setError((e as Error).message);
      }
    };
    void update();
    map.on('moveend', update);
    return () => {
      disposed = true;
      map.off('moveend', update);
      cleanups.forEach((fn) => fn());
    };
  }, [map, visible, datasets]);
  const attempt = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <WorkspacePane
        id="left"
        title="Approved snapshots and releases"
        className="gis-pane gis-workspace"
      >
        <p>
          Choose an approved snapshot, inspect its preview, then publish. Public
          packages retain their existing hashes, campus isolation and offline
          reader compatibility.
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <label>
          Approved snapshot
          <select value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">Choose…</option>
            {reviews.map((r) => (
              <option key={r.id} value={r.id}>
                {r.summary} · {r.content_hash.slice(0, 12)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Release summary
          <textarea
            value={summary}
            maxLength={500}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>
        <button
          disabled={!canPublish || !id || summary.trim().length < 5 || busy}
          onClick={() =>
            void attempt(() =>
              mutate(() => api('prepare-release', { reviewId: id, summary })),
            )
          }
        >
          Build approved preview
        </button>
        {releases.map((r) => (
          <article key={r.id} className="gis-job">
            <strong>{r.summary}</strong> · {r.status}
            {r.error && <p role="alert">{r.error}</p>}
            <div className="gis-toolbar">
              {r.preview_url && (
                <a href={r.preview_url} target="_blank" rel="noreferrer">
                  Open preview
                </a>
              )}
              {r.deployment_url && (
                <a href={r.deployment_url} target="_blank" rel="noreferrer">
                  Published map
                </a>
              )}
              {r.status === 'published' &&
                r.review_id &&
                r.deployment_url &&
                r.version && (
                  <a
                    href={releasedLayoutUrl(r.deployment_url, r.version)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Export released map layout
                  </a>
                )}
              {r.status === 'preview' && (
                <button
                  disabled={!canPublish || busy}
                  onClick={() =>
                    void attempt(() =>
                      mutate(() => api('publish-release', { id: r.id })),
                    )
                  }
                >
                  Publish this preview
                </button>
              )}
              {r.status === 'published' && (
                <button
                  disabled={!canPublish || busy}
                  onClick={() =>
                    void attempt(() =>
                      mutate(() =>
                        gisApi('gis-review-restore', {
                          id: r.id,
                          operationId: crypto.randomUUID(),
                        }),
                      ),
                    )
                  }
                >
                  Submit restoration for review
                </button>
              )}
            </div>
          </article>
        ))}
      </WorkspacePane>
      <WorkspacePane
        id="right"
        title="Map views and exports"
        className="gis-pane gis-workspace"
      >
        <details>
          <summary>Shared map views</summary>
          <div className="gis-toolbar">
            <input
              placeholder="View name"
              aria-label="View name"
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
            />
            <button
              disabled={
                !map ||
                !viewName.trim() ||
                !capabilities.capabilities.includes('edit')
              }
              onClick={() => {
                if (!map) return;
                const center = map.getCenter(),
                  existing = views.find((v) => v.name === viewName);
                void attempt(() =>
                  mutate(() =>
                    gisApi('gis-view-save', {
                      operationId: crypto.randomUUID(),
                      view: {
                        id: existing?.id || crypto.randomUUID(),
                        revision: existing?.revision || 0,
                        name: viewName,
                        center: [center.lng, center.lat],
                        zoom: map.getZoom(),
                        bearing: map.getBearing(),
                        pitch: map.getPitch(),
                        datasets: visible,
                      },
                    }),
                  ),
                );
              }}
            >
              Save view
            </button>
            {views.map((v) => (
              <button
                key={v.name}
                onClick={() => {
                  setVisible(v.datasets);
                  map?.jumpTo(v);
                }}
              >
                {v.name}
              </button>
            ))}
          </div>
        </details>
        <fieldset>
          <legend>Layout layers (up to five, 500 features each)</legend>
          {datasets
            .filter((d) => d.provenance.kind !== 'table')
            .map((d) => (
              <label key={d.id}>
                <input
                  type="checkbox"
                  checked={visible.includes(d.id)}
                  disabled={!visible.includes(d.id) && visible.length >= 5}
                  onChange={(e) =>
                    setVisible((v) =>
                      e.target.checked
                        ? [...v, d.id]
                        : v.filter((id) => id !== d.id),
                    )
                  }
                />
                {d.name}
              </label>
            ))}
        </fieldset>
        <output>{mapNotice}</output>
        <details>
          <summary>Map layout: A4 / A3 PNG and PDF</summary>
          <p>
            Exports the current draft map view with title, scale, north arrow,
            legend, attribution and date. Set a flat view for a conventional map
            scale. PNG files retain the view, dataset revisions, styling and
            source provenance in an embedded receipt. These are draft exports;
            use the release preview to inspect approved public content.
          </p>
          <label>
            Map title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Paper
            <select
              value={paper}
              onChange={(e) => setPaper(e.target.value as 'A4' | 'A3')}
            >
              <option>A4</option>
              <option>A3</option>
            </select>
          </label>
          <label>
            Attribution
            <input
              value={attribution}
              onChange={(e) => setAttribution(e.target.value)}
            />
          </label>
          <div className="gis-toolbar">
            <button
              disabled={!map || busy || !mapComplete}
              onClick={() =>
                void attempt(async () =>
                  downloadLayout(
                    await renderMapLayout(
                      map!,
                      datasets.filter((d) => visible.includes(d.id)),
                      title,
                      paper,
                      attribution,
                    ),
                    title,
                  ),
                )
              }
            >
              Export PNG
            </button>
            <button
              disabled={!map || busy || !mapComplete}
              onClick={() => {
                const popup = window.open('', '_blank');
                if (!popup) {
                  setError('Allow the print window to export PDF.');
                  return;
                }
                popup.opener = null;
                void attempt(async () => {
                  try {
                    printLayout(
                      popup,
                      await renderMapLayout(
                        map!,
                        datasets.filter((d) => visible.includes(d.id)),
                        title,
                        paper,
                        attribution,
                      ),
                      paper,
                      title,
                    );
                  } catch (e) {
                    popup.close();
                    throw e;
                  }
                });
              }}
            >
              Print / Save as PDF
            </button>
          </div>
        </details>
      </WorkspacePane>
    </>
  );
}
function releasedLayoutUrl(origin: string, version: string) {
  const url = new URL(origin);
  url.searchParams.set('campus', requestedCampus());
  url.searchParams.set('mapLayout', '1');
  url.searchParams.set('layoutVersion', version);
  return url.href;
}
