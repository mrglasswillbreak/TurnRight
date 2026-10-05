import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  ChevronRight,
  FileUp,
  Globe2,
  Layers,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from './supabase';
import { campusUrl, lasuCampus, type CampusIdentity } from './campus-context';
import { getPreference, setPreference, hashBytes } from './offline';
import { ImportMapPreview } from './ImportMapPreview';
import { mapFileAccept, mapFormats } from './map-formats';
import type { CampusData, Position } from './types';
import { finitePosition } from './validation';
import type {
  CampusImport,
  CampusSource,
  ImportConfiguration,
  ImportLayerMapping,
  ImportSourceKind,
} from './map-import-types';
import {
  sameImportConfiguration,
  suggestedImportIdentifier,
} from './map-import-types';
import './campus-workspace.css';
import { processes } from './process-monitor';

type Identity = CampusIdentity & { boundary: CampusData['boundary'] };
const blank: ImportConfiguration = {
  layers: [],
  attribution: '',
  license: '',
  redistributionConfirmed: false,
};
const roles: ImportLayerMapping['role'][] = [
  'building',
  'path',
  'place',
  'entrance',
  'barrier',
  'landcover',
  'road-surface',
  'overlay',
  'boundary',
  'skip',
];
export default function CampusWorkspace({
  current = lasuCampus,
  currentData,
  owner,
  dark,
  onClose,
  onSwitch,
  onReview,
}: {
  current?: CampusIdentity;
  currentData?: CampusData;
  owner: string;
  dark: boolean;
  onClose: () => void;
  onSwitch: (campus: CampusIdentity) => Promise<void>;
  onReview: () => Promise<void>;
}) {
  const [campuses, setCampuses] = useState<Identity[]>([]),
    [sources, setSources] = useState<CampusSource[]>([]),
    [imports, setImports] = useState<CampusImport[]>([]);
  const [query, setQuery] = useState(''),
    [creating, setCreating] = useState(false),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [name, setName] = useState(''),
    [slug, setSlug] = useState(''),
    [vertices, setVertices] = useState<Position[]>([]),
    [boundaryText, setBoundaryText] = useState(''),
    [drawing, setDrawing] = useState(false);
  const [sourceKind, setSourceKind] = useState<ImportSourceKind>('file'),
    [sourceName, setSourceName] = useState(''),
    [sourceUrl, setSourceUrl] = useState('');
  const [job, setJob] = useState<CampusImport | null>(null),
    [configuration, setConfiguration] = useState<ImportConfiguration>(blank),
    [scheduledOsm, setScheduledOsm] = useState(false);
  const [uncertainReview, setUncertainReview] = useState<string | null>(null);
  const [centre, setCentre] = useState(''),
    [previewCampus, setPreviewCampus] = useState(current);
  const [boundaryIndex, setBoundaryIndex] = useState(0);
  const boundaryChoices = useMemo<CampusData['boundary'][]>(() => {
    try {
      const value = JSON.parse(boundaryText);
      const features =
        value.type === 'FeatureCollection'
          ? value.features
          : [
              value.type === 'Feature'
                ? value
                : { type: 'Feature', properties: {}, geometry: value },
            ];
      return features.filter((f: GeoJSON.Feature) =>
        ['Polygon', 'MultiPolygon'].includes(f.geometry?.type),
      );
    } catch {
      return [];
    }
  }, [boundaryText]);
  const importedBoundary = boundaryChoices[boundaryIndex] || boundaryChoices[0];
  const boundaryCampus = useMemo(() => {
    if (!importedBoundary) return previewCampus;
    const points: Position[] = [];
    const visit = (value: unknown) => {
      if (finitePosition(value)) points.push([value[0], value[1]]);
      else if (Array.isArray(value)) value.forEach(visit);
    };
    if ('coordinates' in importedBoundary.geometry)
      visit(importedBoundary.geometry.coordinates);
    if (!points.length || points.length > 10000) return previewCampus;
    return {
      ...previewCampus,
      bounds: [
        [
          Math.min(...points.map((p) => p[0])),
          Math.min(...points.map((p) => p[1])),
        ],
        [
          Math.max(...points.map((p) => p[0])),
          Math.max(...points.map((p) => p[1])),
        ],
      ] as [Position, Position],
    };
  }, [importedBoundary, previewCampus]);
  const refresh = useCallback(async () => {
    const [directory, queue] = await Promise.all([
      api<{ campuses: Identity[] }>('campus-list'),
      api<{
        sources: CampusSource[];
        imports: CampusImport[];
        scheduledOsmEnabled: boolean;
      }>('import-list'),
    ]);
    setCampuses(directory.campuses);
    setSources(queue.sources);
    setImports(queue.imports);
    setScheduledOsm(queue.scheduledOsmEnabled);
    return queue.imports;
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  const resumable = job && ['running', 'queued'].includes(job.status);
  useEffect(() => {
    if (!resumable) return;
    const timer = setInterval(() => {
      void api<{ job: CampusImport }>('import-get', { importId: job!.id })
        .then(({ job: next }) => {
          setJob(next);
          if (next.status === 'mapping')
            setConfiguration(suggestMappings(next));
        })
        .catch((e) => setError(e.message));
    }, 4000);
    return () => clearInterval(timer);
  }, [resumable, job?.id]);
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const recoveryKey = `import-wizard:${owner}:${current.id}`;
  useEffect(() => {
    void getPreference<{
      name: string;
      slug: string;
      vertices: Position[];
      boundaryText: string;
    } | null>(recoveryKey, null).then((d) => {
      if (d) {
        setName(d.name);
        setSlug(d.slug);
        setVertices(d.vertices);
        setBoundaryText(d.boundaryText);
      }
    });
  }, [recoveryKey]);
  useEffect(() => {
    if (!creating) return;
    const timer = setTimeout(
      () =>
        void setPreference(recoveryKey, { name, slug, vertices, boundaryText }),
      300,
    );
    return () => clearTimeout(timer);
  }, [name, slug, vertices, boundaryText, creating, recoveryKey]);
  const openJob = async (next: CampusImport) => {
    const saved = await getPreference<ImportConfiguration | null>(
      `${recoveryKey}:${next.id}`,
      null,
    );
    setJob(next);
    setAdding(false);
    setCreating(false);
    setConfiguration(
      saved &&
        !['running', 'queued', 'reviewed', 'cancelled'].includes(next.status)
        ? saved
        : next.status === 'mapping'
          ? suggestMappings(next)
          : next.configuration,
    );
  };
  useEffect(() => {
    if (!job || !['mapping', 'preview', 'failed', 'draft'].includes(job.status))
      return;
    const timer = setTimeout(
      () => void setPreference(`${recoveryKey}:${job.id}`, configuration),
      300,
    );
    return () => {
      clearTimeout(timer);
      // Leaving the wizard must retain the final edit even before debounce fires.
      void setPreference(`${recoveryKey}:${job.id}`, configuration);
    };
  }, [job, configuration, recoveryKey]);
  const selectedSource = sources.find((s) => s.id === job?.source_id);
  const counts = job?.summary?.counts;
  const reviewBlocker =
    job?.status !== 'preview'
      ? ''
      : uncertainReview === job.id
        ? 'Check review status before submitting this import again.'
        : busy
          ? 'Wait for the current operation to finish.'
          : !job.summary
            ? 'Preview details are unavailable. Reopen this import or rebuild its preview.'
            : job.summary.errors.length
              ? 'Resolve the preview errors shown above, then rebuild the preview.'
              : !sameImportConfiguration(configuration, job.configuration)
                ? 'Settings changed since this preview was built. Rebuild preview to include your changes.'
                : '';
  const filesChanged = async (files: File[]) =>
    run(async () => {
      if (!files.length || !job) return;
      if (
        Array.from(files).reduce((sum, f) => sum + f.size, 0) >
        50 * 1024 * 1024
      )
        throw new Error('Choose an upload batch no larger than 50 MiB.');
      const progress = processes.begin('Map file upload', 'Preparing files');
      let uploaded = 0;
      try {
        for (const file of Array.from(files)) {
          progress.update(
            `Uploading ${file.name}`,
            uploaded,
            files.length,
            'files',
          );
          const bytes = await file.arrayBuffer(),
            sha256 = await hashBytes(bytes);
          const result = await api<{ url: string; job?: CampusImport }>(
            'import-upload',
            {
              importId: job.id,
              name: file.name,
              bytes: file.size,
              sha256,
            },
          );
          if (result.job) setJob(result.job);
          const response = await fetch(result.url, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/octet-stream',
              'x-upsert': 'false',
            },
            body: file,
            signal: AbortSignal.timeout(120000),
          });
          const failed = !response.ok
            ? await response.json().catch(() => ({}))
            : null;
          if (
            !response.ok &&
            failed?.error !== 'Duplicate' &&
            failed?.statusCode !== '409'
          )
            throw new Error(
              'Upload was interrupted. Select the same files to resume; completed uploads will be retained.',
            );
          uploaded++;
        }
        progress.finish(`${uploaded} files uploaded; ready to inspect`);
      } catch (error) {
        progress.fail(error);
        throw error;
      }
      setNotice(`${files.length} file(s) uploaded. Inspect the layers next.`);
    });
  const startPhase = async (phase: 'inspect' | 'preview') =>
    run(async () => {
      if (!job) return;
      const result = await api<{ job: CampusImport }>('import-run', {
        importId: job.id,
        phase,
        configuration,
      });
      setJob(result.job);
    });
  const mappedCount = useMemo(
    () => configuration.layers.filter((l) => l.role !== 'skip').length,
    [configuration],
  );
  return (
    <section className="campus-workspace" aria-label="Campuses workspace">
      <header className="campus-workspace-header">
        <div>
          <span className="editor-eyebrow">PRIVATE WORKSPACE</span>
          <h2>
            <Globe2 size={23} /> Campuses
          </h2>
          <p>Import, review and publish each campus independently.</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close campuses"
          onClick={onClose}
        >
          <X />
        </Button>
      </header>
      <div className="campus-workspace-body">
        <aside className="campus-directory">
          <label className="campus-search">
            <Search size={17} />
            <input
              aria-label="Search campuses"
              placeholder="Search campuses"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <Button
            className="w-full"
            onClick={() => {
              setCreating(true);
              setJob(null);
              setAdding(false);
            }}
          >
            <Plus /> New campus
          </Button>
          <div className="campus-directory-list">
            {campuses
              .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
              .map((c) => (
                <button
                  key={c.id}
                  className={c.id === current.id ? 'selected' : ''}
                  aria-current={c.id === current.id ? 'page' : undefined}
                  onClick={() => void run(() => onSwitch(c))}
                  disabled={busy}
                >
                  <span className="campus-list-icon">
                    <Building2 size={19} />
                  </span>
                  <span>
                    <strong>{c.name}</strong>
                    <small>/{c.slug}</small>
                  </span>
                  {c.id === current.id ? (
                    <Check size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </button>
              ))}
          </div>
          <p className="small-note">
            Published campuses appear in the public map switcher. Unpublished
            imports stay private.
          </p>
        </aside>
        <main className="campus-content">
          {error && (
            <p role="alert" className="campus-error">
              {error}
            </p>
          )}
          {notice && <output className="campus-notice">{notice}</output>}
          {creating ? (
            <>
              <div className="campus-title">
                <h3>Create a campus</h3>
                <Button variant="ghost" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </div>
              <div className="campus-fields">
                <label>
                  Campus name
                  <input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/^-|-$/g, ''),
                      );
                    }}
                    placeholder="University · North campus"
                    maxLength={160}
                  />
                </label>
                <label>
                  Public URL name
                  <input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    maxLength={80}
                  />
                  <small>{campusUrl('/', slug || 'new-campus')}</small>
                </label>
              </div>
              <p>
                Move the map to the location, then draw its boundary. You can
                also paste or upload a GeoJSON polygon.
              </p>
              <div className="campus-actions">
                <input
                  aria-label="Map centre longitude, latitude"
                  placeholder="Longitude, latitude"
                  value={centre}
                  onChange={(e) => setCentre(e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    const [x, y] = centre.split(',').map(Number);
                    if (
                      !Number.isFinite(x) ||
                      !Number.isFinite(y) ||
                      Math.abs(x) > 180 ||
                      Math.abs(y) > 90
                    ) {
                      setError(
                        'Enter longitude, latitude within world bounds.',
                      );
                      return;
                    }
                    setPreviewCampus({
                      ...current,
                      bounds: [
                        [x - 0.01, y - 0.01],
                        [x + 0.01, y + 0.01],
                      ],
                    });
                  }}
                >
                  Go to location
                </Button>
                <Button
                  variant={drawing ? 'default' : 'outline'}
                  onClick={() => setDrawing(!drawing)}
                >
                  <MapPin />
                  {drawing ? 'Drawing boundary' : 'Draw boundary'}
                </Button>
                <Button
                  variant="ghost"
                  disabled={!vertices.length}
                  onClick={() => setVertices((v) => v.slice(0, -1))}
                >
                  Undo point
                </Button>
              </div>
              <ImportMapPreview
                key={JSON.stringify(boundaryCampus.bounds)}
                campus={boundaryCampus}
                boundary={importedBoundary}
                dark={dark}
                drawing={drawing}
                vertices={vertices}
                onVertex={(p) => setVertices((v) => [...v, p])}
              />
              <label>
                Boundary GeoJSON
                <textarea
                  rows={3}
                  value={boundaryText}
                  onChange={(e) => setBoundaryText(e.target.value)}
                  placeholder="Paste a Polygon, MultiPolygon, Feature or FeatureCollection"
                />
              </label>
              {boundaryChoices.length > 1 && (
                <label>
                  Choose imported boundary
                  <select
                    value={boundaryIndex}
                    onChange={(e) => setBoundaryIndex(Number(e.target.value))}
                  >
                    {boundaryChoices.map((f, i) => (
                      <option key={i} value={i}>
                        {String(
                          f.properties?.name ||
                            f.properties?.NAME ||
                            `Boundary ${i + 1}`,
                        )}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {boundaryText && !importedBoundary && (
                <p className="campus-error">
                  Choose a GeoJSON polygon or a collection containing a polygon.
                  Coordinates must use WGS84 longitude, latitude.
                </p>
              )}
              <label className="campus-file">
                <FileUp size={18} /> Import boundary GeoJSON
                <input
                  type="file"
                  accept=".geojson,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file)
                      void file
                        .text()
                        .then(setBoundaryText)
                        .catch((err) => setError(err.message));
                  }}
                />
              </label>
              <div className="campus-actions">
                <span>{vertices.length} drawn points</span>
                <Button
                  disabled={
                    busy ||
                    !name ||
                    !slug ||
                    (boundaryText ? !importedBoundary : vertices.length < 3)
                  }
                  onClick={() =>
                    void run(async () => {
                      let boundary: CampusData['boundary'];
                      if (boundaryText) {
                        boundary = importedBoundary;
                      } else
                        boundary = {
                          type: 'Feature',
                          properties: {},
                          geometry: {
                            type: 'Polygon',
                            coordinates: [[...vertices, vertices[0]]],
                          },
                        };
                      const result = await api<{ campus: Identity }>(
                        'campus-create',
                        { name, slug, boundary },
                      );
                      await setPreference(recoveryKey, null);
                      await onSwitch(result.campus);
                    })
                  }
                >
                  <Plus /> Create campus
                </Button>
              </div>
            </>
          ) : job ? (
            <>
              <div className="campus-title">
                <div>
                  <span className="editor-eyebrow">IMPORT DATA</span>
                  <h3>{selectedSource?.name || 'Map import'}</h3>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setJob(null);
                    void refresh();
                  }}
                >
                  Back to sources
                </Button>
              </div>
              <ol className="import-steps">
                {['Upload / source', 'Map fields', 'Preview', 'Review'].map(
                  (s, i) => (
                    <li
                      key={s}
                      className={
                        i ===
                        (job.status === 'draft' ||
                        job.status === 'running' ||
                        job.status === 'queued'
                          ? 0
                          : job.status === 'mapping'
                            ? 1
                            : job.status === 'reviewed'
                              ? 3
                              : 2)
                          ? 'active'
                          : ''
                      }
                    >
                      {i + 1}. {s}
                    </li>
                  ),
                )}
              </ol>
              <output>
                {job.message ||
                  (job.status === 'mapping'
                    ? 'Choose the layers and map their fields before building a preview.'
                    : job.status === 'preview'
                      ? 'Inspect the proposed changes before adding them to source review.'
                      : 'Add your files, then inspect the available layers.')}
              </output>
              {(job.status === 'draft' || job.status === 'failed') && (
                <div className="import-upload">
                  {selectedSource?.kind === 'file' && (
                    <label className="campus-file">
                      <Upload /> Choose map files
                      <input
                        multiple
                        type="file"
                        accept={mapFileAccept}
                        disabled={busy}
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          e.target.value = '';
                          void filesChanged(files);
                        }}
                      />
                    </label>
                  )}
                  <p>
                    GeoJSON · Shapefile ZIP · GeoPackage · KML/KMZ · GPX · CSV ·
                    OSM XML/PBF. Up to 50 MiB per batch.
                  </p>
                  <Button
                    disabled={busy}
                    onClick={() => void startPhase('inspect')}
                  >
                    <Layers /> Inspect layers
                  </Button>
                </div>
              )}
              {resumable && (
                <p className="campus-notice">
                  Processing in the background. You can close this workspace and
                  resume from Recent imports.
                </p>
              )}
              {['mapping', 'preview', 'failed'].includes(job.status) && (
                <>
                  <label className="field-label">
                    Update existing data
                    <select
                      value={configuration.refreshMode || 'merge'}
                      onChange={(e) =>
                        setConfiguration((c) => ({
                          ...c,
                          refreshMode: e.target
                            .value as ImportConfiguration['refreshMode'],
                        }))
                      }
                    >
                      <option value="merge">
                        Add and update selected layers; retain existing records
                      </option>
                      <option value="replace-layer">
                        Replace selected layers, including missing records
                      </option>
                      <option value="replace-source">
                        Replace the complete source, including missing layers
                      </option>
                    </select>
                  </label>
                  <p className="hint">
                    Routine geometry fixes are automatic and listed in the
                    preview. Uncertain repairs need review.
                  </p>
                  {job.summary?.layers.map((layer) => {
                    const index = configuration.layers.findIndex(
                        (m) => m.layer === layer.name,
                      ),
                      m = configuration.layers[index] || {
                        layer: layer.name,
                        role: layer.suggestedRole,
                      };
                    const update = (patch: Partial<ImportLayerMapping>) =>
                      setConfiguration((c) => ({
                        ...c,
                        layers:
                          index < 0
                            ? [...c.layers, { ...m, ...patch }]
                            : c.layers.map((l, i) =>
                                i === index ? { ...l, ...patch } : l,
                              ),
                      }));
                    return (
                      <details
                        className="import-layer"
                        key={layer.name}
                        open={job.status === 'mapping'}
                      >
                        <summary>
                          <Layers size={16} />
                          <strong>{layer.name}</strong>
                          <span>
                            {layer.count.toLocaleString()} features ·{' '}
                            {layer.format ? `${layer.format} · ` : ''}
                            {layer.sourceCrs ||
                              layer.crs ||
                              'Projection required'}
                          </span>
                        </summary>
                        <div className="campus-fields">
                          <label>
                            Import as
                            <select
                              value={m.role}
                              onChange={(e) =>
                                update({
                                  role: e.target
                                    .value as ImportLayerMapping['role'],
                                })
                              }
                            >
                              {roles.map((role) => (
                                <option key={role}>{role}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Source projection
                            <input
                              value={m.crs || ''}
                              onChange={(e) => update({ crs: e.target.value })}
                              placeholder={
                                layer.sourceCrs || layer.crs || 'EPSG:4326'
                              }
                            />
                            {layer.crs && !layer.requiresCoordinates && (
                              <small>
                                Leave empty to use the file’s detected
                                projection.
                              </small>
                            )}
                          </label>
                          <label>
                            Existing layer identity
                            <input
                              value={m.identity || ''}
                              placeholder={layer.name}
                              onChange={(e) => {
                                const prior = sources
                                  .find((s) => s.id === job.source_id)
                                  ?.configuration.layers.find(
                                    (l) =>
                                      (l.identity || l.layer) ===
                                      e.target.value,
                                  );
                                update({
                                  ...prior,
                                  layer: layer.name,
                                  identity: e.target.value || undefined,
                                });
                              }}
                              list="accepted-layer-identities"
                            />
                            <small>
                              Keep the accepted layer identity when a
                              replacement file is renamed.
                            </small>
                          </label>
                          {(
                            [
                              'idField',
                              'nameField',
                              'categoryField',
                              'heightField',
                              'floorsField',
                              'accessField',
                              'roadClassField',
                              'surfaceField',
                              'widthField',
                              'landUseField',
                              'vegetationField',
                              'labelField',
                              'geometryField',
                              ...(layer.requiresCoordinates || !layer.crs
                                ? ['longitudeField', 'latitudeField']
                                : []),
                            ] as (keyof ImportLayerMapping)[]
                          ).map((field) => (
                            <label key={field}>
                              {
                                (
                                  {
                                    idField: 'Stable identifier',
                                    nameField: 'Name',
                                    categoryField: 'Category',
                                    heightField: 'Height',
                                    floorsField: 'Floors',
                                    accessField: 'Access',
                                    roadClassField: 'Road class',
                                    surfaceField: 'Surface',
                                    widthField: 'Width',
                                    landUseField: 'Land use / class',
                                    vegetationField: 'Vegetation',
                                    labelField: 'Overlay label',
                                    geometryField: 'WKT geometry (CSV)',
                                    longitudeField: 'Longitude / X',
                                    latitudeField: 'Latitude / Y',
                                  } as Record<string, string>
                                )[field]
                              }
                              <select
                                value={String(m[field] || '')}
                                onChange={(e) =>
                                  update({
                                    [field]: e.target.value || undefined,
                                  })
                                }
                              >
                                <option value="">Not mapped</option>
                                {layer.fields.map((f) => (
                                  <option key={f.name} value={f.name}>
                                    {f.alias || f.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                          {m.role === 'path' && (
                            <label>
                              Walking access
                              <select
                                value={m.walkingAccess || 'private'}
                                onChange={(e) =>
                                  update({
                                    walkingAccess: e.target
                                      .value as ImportLayerMapping['walkingAccess'],
                                  })
                                }
                              >
                                <option value="private">
                                  Restricted until reviewed
                                </option>
                                <option value="yes">Walking permitted</option>
                                <option value="no">No walking access</option>
                              </select>
                            </label>
                          )}
                          {m.heightField && (
                            <label>
                              Height units
                              <select
                                value={m.heightUnit || 'm'}
                                onChange={(e) =>
                                  update({
                                    heightUnit: e.target.value as 'm' | 'ft',
                                  })
                                }
                              >
                                <option value="m">Metres</option>
                                <option value="ft">Feet</option>
                              </select>
                            </label>
                          )}
                          {m.widthField && (
                            <label>
                              Width units
                              <select
                                value={m.widthUnit || 'm'}
                                onChange={(e) =>
                                  update({
                                    widthUnit: e.target.value as 'm' | 'ft',
                                  })
                                }
                              >
                                <option value="m">Metres</option>
                                <option value="ft">Feet</option>
                              </select>
                            </label>
                          )}
                          {m.role === 'overlay' && (
                            <>
                              <label>
                                Colour
                                <input
                                  type="color"
                                  value={m.color || '#2563eb'}
                                  onChange={(e) =>
                                    update({ color: e.target.value })
                                  }
                                />
                              </label>
                              <label>
                                Opacity
                                <input
                                  type="number"
                                  min="0"
                                  max="1"
                                  step="0.1"
                                  value={m.opacity ?? 0.5}
                                  onChange={(e) =>
                                    update({ opacity: Number(e.target.value) })
                                  }
                                />
                              </label>
                              <label>
                                Layer order
                                <input
                                  type="number"
                                  min="-1000"
                                  max="1000"
                                  value={m.order ?? 0}
                                  onChange={(e) =>
                                    update({ order: Number(e.target.value) })
                                  }
                                />
                              </label>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={m.visible !== false}
                                  onChange={(e) =>
                                    update({ visible: e.target.checked })
                                  }
                                />
                                Visible
                              </label>
                            </>
                          )}
                        </div>
                      </details>
                    );
                  })}
                  <datalist id="accepted-layer-identities">
                    {sources
                      .find((s) => s.id === job.source_id)
                      ?.configuration.layers.map((m) => (
                        <option key={m.layer} value={m.identity || m.layer}>
                          {m.identity || m.layer}
                        </option>
                      ))}
                  </datalist>
                  <div className="campus-fields">
                    <label>
                      Attribution
                      <input
                        value={configuration.attribution}
                        onChange={(e) =>
                          setConfiguration((c) => ({
                            ...c,
                            attribution: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      License / permission
                      <input
                        value={configuration.license}
                        onChange={(e) =>
                          setConfiguration((c) => ({
                            ...c,
                            license: e.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label className="campus-check">
                    <input
                      type="checkbox"
                      checked={configuration.redistributionConfirmed}
                      onChange={(e) =>
                        setConfiguration((c) => ({
                          ...c,
                          redistributionConfirmed: e.target.checked,
                        }))
                      }
                    />
                    This source permits public and offline redistribution with
                    the stated attribution.
                  </label>
                  <Button
                    disabled={busy || !mappedCount}
                    onClick={() => void startPhase('preview')}
                  >
                    <RefreshCw />{' '}
                    {job.status === 'preview'
                      ? 'Rebuild preview'
                      : 'Build preview'}
                  </Button>
                </>
              )}
              {job.summary && (
                <>
                  <details>
                    <summary>Supported vector formats</summary>
                    {mapFormats.map((f) => (
                      <p key={f.name}>
                        {f.name}: {f.extensions.join(', ')}
                      </p>
                    ))}
                  </details>
                  {job.summary.sampling?.some((s) => s.shown < s.total) && (
                    <p className="notice">
                      Preview is sampled across layers; validation includes
                      every feature.{' '}
                      {job.summary.sampling
                        .map((s) => `${s.layer}: ${s.shown}/${s.total}`)
                        .join(' · ')}
                    </p>
                  )}
                  {!!job.summary.repairs?.length && (
                    <details open>
                      <summary>
                        {job.summary.reportCounts?.repairs ??
                          job.summary.repairs.length}{' '}
                        automatic geometry repairs
                      </summary>
                      {(job.summary.reportCounts?.repairs || 0) >
                        job.summary.repairs.length && (
                        <p className="hint">
                          Showing the first {job.summary.repairs.length}{' '}
                          receipts. The complete report is retained with the
                          private import candidate.
                        </p>
                      )}
                      {job.summary.repairs.map((r, i) => (
                        <p key={i}>
                          {r.layer} · {r.sourceId}: {r.actions.join(', ')}
                          {r.areaChangePercent !== undefined
                            ? ` (${r.areaChangePercent.toPrecision(3)}% area change)`
                            : ''}
                        </p>
                      ))}
                    </details>
                  )}
                  {!!job.summary.diagnostics?.length && (
                    <details>
                      <summary>Retained owner corrections</summary>
                      {job.summary.diagnostics.map((d, i) => (
                        <p key={i}>
                          {d.sourceId}: {d.message}
                        </p>
                      ))}
                    </details>
                  )}
                  <ImportMapPreview
                    campus={current}
                    base={currentData}
                    features={job.summary.features}
                    dark={dark}
                  />
                  {counts && (
                    <div className="import-counts">
                      <span>
                        <strong>{counts.added}</strong> additions
                      </span>
                      <span>
                        <strong>{counts.modified}</strong> changes
                      </span>
                      <span>
                        <strong>{counts.removed}</strong> removals
                      </span>
                      <span>
                        <strong>{counts.skipped}</strong> skipped
                      </span>
                    </div>
                  )}
                  {job.summary.errors.map((v, i) => (
                    <p key={i} role="alert" className="campus-error">
                      {v}
                    </p>
                  ))}
                  {job.summary.warnings.map((v, i) => (
                    <p key={i} className="small-note">
                      {v}
                    </p>
                  ))}
                  {job.summary.duplicates.length > 0 && (
                    <p>
                      {job.summary.duplicates.length} overlapping buildings
                      require duplicate review.
                    </p>
                  )}
                </>
              )}
              <div className="campus-actions">
                {reviewBlocker && (
                  <output id="import-review-blocker" className="small-note">
                    {reviewBlocker}
                  </output>
                )}
                {job.status === 'preview' && (
                  <Button
                    disabled={!!reviewBlocker}
                    aria-describedby={
                      reviewBlocker ? 'import-review-blocker' : undefined
                    }
                    onClick={() =>
                      void run(async () => {
                        try {
                          await api('import-queue', { importId: job.id });
                        } catch (error) {
                          // A lost response does not mean the transaction failed.
                          const result = await api<{ job: CampusImport }>(
                            'import-get',
                            { importId: job.id },
                          ).catch(() => null);
                          if (result?.job.status !== 'reviewed') {
                            setUncertainReview(job.id);
                            throw error;
                          }
                        }
                        setJob({ ...job, status: 'reviewed' });
                        setUncertainReview(null);
                        setNotice(
                          'Changes are queued. Review source changes before publishing.',
                        );
                        void refresh().catch(() => {});
                      })
                    }
                  >
                    <Check /> Queue for review
                  </Button>
                )}
                {uncertainReview === job.id && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await api<{ job: CampusImport }>(
                          'import-get',
                          { importId: job.id },
                        );
                        setJob(result.job);
                        setUncertainReview(null);
                        setNotice(
                          result.job.status === 'reviewed'
                            ? 'Changes are queued. Review source changes before publishing.'
                            : 'The server has not queued this preview. You can retry when it is ready.',
                        );
                      })
                    }
                  >
                    <RefreshCw /> Check review status
                  </Button>
                )}
                {job.status === 'reviewed' && (
                  <Button onClick={() => void onReview()}>
                    Open source review <ChevronRight />
                  </Button>
                )}
                {job.status === 'failed' && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void startPhase(job.phase)}
                  >
                    Retry import
                  </Button>
                )}
                {!['reviewed', 'cancelled'].includes(job.status) && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api('import-cancel', { importId: job.id });
                        setJob({ ...job, status: 'cancelled' });
                      })
                    }
                  >
                    Cancel import
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="campus-title">
                <div>
                  <span className="editor-eyebrow">CURRENT CAMPUS</span>
                  <h3>{current.name}</h3>
                </div>
                <Button onClick={() => setAdding(!adding)}>
                  <Plus /> Import data
                </Button>
              </div>
              {adding && (
                <section className="import-source-form">
                  <h4>Add a map source</h4>
                  <div className="campus-source-choices">
                    {(
                      [
                        ['file', 'Upload files', FileUp],
                        ['osm', 'OpenStreetMap', Globe2],
                        ['arcgis', 'ArcGIS', Layers],
                      ] as const
                    ).map(([id, label, Icon]) => (
                      <Button
                        key={id}
                        variant={sourceKind === id ? 'default' : 'outline'}
                        aria-pressed={sourceKind === id}
                        onClick={() => setSourceKind(id)}
                      >
                        <Icon />
                        {label}
                      </Button>
                    ))}
                  </div>
                  <label>
                    Source name
                    <input
                      value={sourceName}
                      onChange={(e) => setSourceName(e.target.value)}
                      placeholder="Buildings and footpaths"
                    />
                  </label>
                  {sourceKind === 'arcgis' && (
                    <label>
                      Public ArcGIS URL
                      <input
                        type="url"
                        value={sourceUrl}
                        onChange={(e) => setSourceUrl(e.target.value)}
                        placeholder="https://…/FeatureServer"
                      />
                    </label>
                  )}
                  {sourceKind === 'osm' && (
                    <p>
                      Download buildings, paths and places intersecting this
                      campus boundary. Source data stays private until reviewed
                      and published.
                    </p>
                  )}
                  <Button
                    disabled={busy || !sourceName}
                    onClick={() =>
                      void run(async () => {
                        const result = await api<{ job: CampusImport }>(
                          'import-start',
                          {
                            name: sourceName,
                            kind: sourceKind,
                            url: sourceUrl,
                          },
                        );
                        await refresh();
                        await openJob(result.job);
                      })
                    }
                  >
                    Continue <ChevronRight />
                  </Button>
                </section>
              )}
              <h4>Saved sources</h4>
              {!sources.length && (
                <p>
                  No sources yet. Import a file or connect OpenStreetMap or
                  ArcGIS to begin.
                </p>
              )}
              {sources.map((source) => (
                <article key={source.id} className="campus-source">
                  <div>
                    <strong>{source.name}</strong>
                    <p>
                      {source.kind === 'osm'
                        ? 'OpenStreetMap'
                        : source.kind === 'arcgis'
                          ? 'ArcGIS'
                          : 'Uploaded files'}
                    </p>
                  </div>
                  <div className="campus-actions">
                    <label>
                      Refresh
                      <select
                        aria-label={`Refresh schedule for ${source.name}`}
                        value={source.schedule}
                        disabled={source.kind === 'file' || busy}
                        onChange={(e) =>
                          void run(async () => {
                            await api('source-schedule', {
                              sourceId: source.id,
                              schedule: e.target.value,
                            });
                            await refresh();
                          })
                        }
                      >
                        <option value="manual">Manual</option>
                        <option
                          value="daily"
                          disabled={source.kind === 'osm' && !scheduledOsm}
                        >
                          Daily review checks
                        </option>
                      </select>
                    </label>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const result = await api<{ job: CampusImport }>(
                            'import-start',
                            { sourceId: source.id },
                          );
                          await refresh();
                          await openJob(result.job);
                        })
                      }
                    >
                      <RefreshCw />
                      {source.kind === 'file' ? 'Replace file' : 'Check source'}
                    </Button>
                  </div>
                </article>
              ))}
              <h4>Recent imports</h4>
              {imports.map((item) => (
                <button
                  className="campus-import-row"
                  key={item.id}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await api<{ job: CampusImport }>(
                        'import-get',
                        { importId: item.id },
                      );
                      await openJob(result.job);
                    })
                  }
                >
                  <span>
                    <strong>
                      {sources.find((s) => s.id === item.source_id)?.name ||
                        'Import'}
                    </strong>
                    <small>{new Date(item.created_at).toLocaleString()}</small>
                  </span>
                  <span>{item.status}</span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </>
          )}
        </main>
      </div>
    </section>
  );
}
function suggestMappings(job: CampusImport): ImportConfiguration {
  return {
    ...job.configuration,
    layers: (job.summary?.layers || []).map((layer) => {
      const existing = job.configuration.layers.find(
        (l) => l.layer === layer.name,
      );
      const field = (names: string[]) =>
        layer.fields.find(
          (f) =>
            names.includes(f.name.toLowerCase()) ||
            (!!f.alias && names.includes(f.alias.toLowerCase())),
        )?.name;
      return (
        existing || {
          layer: layer.name,
          role: layer.suggestedRole,
          idField: suggestedImportIdentifier(layer),
          nameField: field(['name', 'title', 'building_name']),
          heightField: field(['height', 'building_height', 'height_m']),
          categoryField: field(['category', 'building_category', 'amenity']),
          roadClassField: field(['highway', 'road_class', 'roadtype']),
          surfaceField: field(['surface', 'surface_type']),
          widthField: field(['width', 'road_width']),
          landUseField: field(['landuse', 'land_use', 'natural']),
          vegetationField: field(['vegetation', 'vegetation_type']),
          floorsField: field([
            'floors',
            'building:levels',
            'storeys',
            'levels',
          ]),
        }
      );
    }),
  };
}
