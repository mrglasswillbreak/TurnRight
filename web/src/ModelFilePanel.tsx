import { useEffect, useRef, useState } from 'react';
import { Download, Upload, X, Check } from 'lucide-react';
import { ModelButton } from './ModelButton';
import { modelFileTask } from './model-file-client';
import { placeImportedModel } from './model-import-placement';
import { modelFileZip } from './model-file-zip';
import {
  MODEL_FILE_BYTES,
  type ModelFileFormat,
  type ModelImport,
} from './model-file-types';
import type { ModelDocument, MeshSelection } from './model-document';
import type { ModelMesh } from './visual-types';
import type { EditorWorkspace } from './editor-workspace';

export default function ModelFilePanel({
  buildingId,
  workspace,
  document,
  selection,
  onCommit,
  onPreview,
  native,
  disabled,
}: {
  buildingId: string;
  workspace?: EditorWorkspace;
  document: ModelDocument;
  selection: MeshSelection | null;
  onCommit: (document: ModelDocument) => boolean;
  onPreview: (document: ModelDocument | null) => void;
  native: () => Promise<ModelMesh[]>;
  disabled: boolean;
}) {
  const [recovered] = useState(() => {
    try {
      return JSON.parse(
        workspace?.modelInputs[buildingId]?.['mesh:import'] || 'null',
      ) as {
        result: ModelImport;
        scale: number;
        up: 'y' | 'z';
        centre: boolean;
      } | null;
    } catch {
      return null;
    }
  });
  const [files, setFiles] = useState<File[]>([]),
    [primary, setPrimary] = useState(''),
    [result, setResult] = useState<ModelImport | null>(
      recovered?.result || null,
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [scale, setScale] = useState(recovered?.scale ?? 1),
    [up, setUp] = useState<'y' | 'z'>(recovered?.up || 'y'),
    [centre, setCentre] = useState(recovered?.centre ?? true),
    [format, setFormat] = useState<ModelFileFormat>('glb'),
    [scope, setScope] = useState<'all' | 'selected'>('all'),
    [exportScale, setExportScale] = useState(1),
    [exportUp, setExportUp] = useState<'y' | 'z'>('z'),
    [download, setDownload] = useState<{ url: string; name: string } | null>(
      null,
    );
  const task = useRef<AbortController | null>(null);
  useEffect(() => {
    workspace?.recoverModelInput(
      buildingId,
      'mesh:import',
      result ? JSON.stringify({ result, scale, up, centre }) : undefined,
    );
  }, [result, scale, up, centre, buildingId, workspace]);
  useEffect(
    () => () => {
      task.current?.abort();
    },
    [],
  );
  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download.url);
    },
    [download],
  );
  const run = async (fn: (signal: AbortSignal) => Promise<void>) => {
    task.current?.abort();
    const controller = new AbortController();
    task.current = controller;
    setBusy(true);
    setError('');
    try {
      await fn(controller.signal);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (task.current === controller) setBusy(false);
    }
  };
  const load = () =>
    run(async (signal) => {
      if (files.reduce((n, f) => n + f.size, 0) > MODEL_FILE_BYTES)
        throw new Error('Choose files totalling at most 50 MiB.');
      const parsed = await modelFileTask(
        {
          kind: 'import',
          files: await Promise.all(
            files.map(async (f) => ({
              name: f.webkitRelativePath || f.name,
              data: await f.arrayBuffer(),
            })),
          ),
          primary,
        },
        signal,
      );
      setResult(parsed);
      setUp(/\.(glb|gltf)$/i.test(primary) ? 'y' : 'z');
    });
  const candidate = () => {
    if (!result) throw new Error('Choose a model file first.');
    return placeImportedModel(document, result, { scale, up, centre });
  };
  const preview = () => {
    try {
      onPreview(candidate());
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  const accept = () => {
    try {
      if (onCommit(candidate())) {
        setResult(null);
        onPreview(null);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  const exportFiles = () =>
    run(async (signal) => {
      if (scope === 'selected' && !selection?.objectId)
        throw new Error('Select an object to export.');
      const ids = new Set([selection?.objectId]);
      let old = -1;
      while (old !== ids.size) {
        old = ids.size;
        for (const o of document.objects)
          if (o.parentId && ids.has(o.parentId)) ids.add(o.id);
      }
      const source =
        scope === 'selected'
          ? {
              ...document,
              objects: document.objects
                .filter((o) => ids.has(o.id))
                .map((o) => ({
                  ...o,
                  parentId: ids.has(o.parentId) ? o.parentId : undefined,
                })),
            }
          : document;
      const files = await modelFileTask(
        {
          kind: 'export',
          document: source,
          options: { format, scale: exportScale, up: exportUp },
          native:
            scope === 'all' && !document.replaceVisual ? await native() : [],
        },
        signal,
      );
      const name = files.length > 1 ? 'model-obj.zip' : files[0].name,
        blob =
          files.length > 1 ? modelFileZip(files) : new Blob([files[0].data]);
      setDownload({ name, url: URL.createObjectURL(blob) });
    });
  return (
    <details className="model-file-panel">
      <summary>Import and export</summary>
      <p>
        Static GLB/glTF, OBJ with MTL/textures, and STL. Include every
        dependency in the selection. Files are processed locally; external URLs
        are never downloaded.
      </p>
      <fieldset disabled={disabled || busy}>
        <legend>Import model</legend>
        <label>
          Model and companion files
          <input
            type="file"
            multiple
            accept=".glb,.gltf,.bin,.obj,.mtl,.stl,.png,.jpg,.jpeg,.webp"
            onChange={(e) => {
              const selected = [...(e.target.files || [])];
              setFiles(selected);
              setPrimary(
                selected.find((f) => /\.(glb|gltf|obj|stl)$/i.test(f.name))
                  ?.name || '',
              );
              setResult(null);
              onPreview(null);
            }}
          />
        </label>
        <label>
          Primary model
          <select
            aria-label="Primary model"
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
          >
            {files
              .filter((f) => /\.(glb|gltf|obj|stl)$/i.test(f.name))
              .map((f) => (
                <option key={f.name} value={f.webkitRelativePath || f.name}>
                  {f.name}
                </option>
              ))}
          </select>
        </label>
        <ModelButton icon={<Upload />} disabled={!primary} onClick={load}>
          Inspect import
        </ModelButton>
        {result && (
          <div className="model-import-preview">
            <p>
              {result.filename} · {result.vertices.toLocaleString()} vertices ·{' '}
              {result.faces.toLocaleString()} faces ·{' '}
              {result.document.materials.length} materials
            </p>
            <p>
              Source dimensions:{' '}
              {result.dimensions.map((n) => n.toFixed(3)).join(' × ')} units
            </p>
            <label>
              Import units
              <select
                aria-label="Import units"
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
              >
                <option value={1}>Metres</option>
                <option value={0.01}>Centimetres</option>
                <option value={0.001}>Millimetres</option>
                <option value={0.3048}>Feet</option>
                <option value={0.0254}>Inches</option>
              </select>
            </label>
            <label>
              Import up axis
              <select
                aria-label="Import up axis"
                value={up}
                onChange={(e) => setUp(e.target.value as 'y' | 'z')}
              >
                <option value="y">Y up (glTF)</option>
                <option value="z">Z up</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={centre}
                onChange={(e) => setCentre(e.target.checked)}
              />
              Centre at building origin and rest on ground
            </label>
            {result.missing.length > 0 && (
              <output>Missing dependencies: {result.missing.join(', ')}</output>
            )}
            {result.warnings.length > 0 && (
              <ul>
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <div className="model-toolbar">
              <ModelButton onClick={preview}>Preview on building</ModelButton>
              <ModelButton icon={<Check />} variant="default" onClick={accept}>
                Add imported model
              </ModelButton>
              <ModelButton
                icon={<X />}
                onClick={() => {
                  setResult(null);
                  onPreview(null);
                }}
              >
                Discard import
              </ModelButton>
            </div>
          </div>
        )}
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Export geometry</legend>
        <label>
          Export scope
          <select
            aria-label="Export scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
          >
            <option value="all">Whole building</option>
            <option value="selected">Selected objects</option>
          </select>
        </label>
        <label>
          Export format
          <select
            aria-label="Export format"
            value={format}
            onChange={(e) => setFormat(e.target.value as ModelFileFormat)}
          >
            <option value="glb">GLB · recommended</option>
            <option value="gltf">glTF · embedded dependencies</option>
            <option value="obj">OBJ + MTL + textures (ZIP)</option>
            <option value="stl">Binary STL · geometry only</option>
          </select>
        </label>
        {(format === 'obj' || format === 'stl') && (
          <>
            <label>
              Export units
              <select
                aria-label="Export units"
                value={exportScale}
                onChange={(e) => setExportScale(Number(e.target.value))}
              >
                <option value={1}>Metres</option>
                <option value={100}>Centimetres</option>
                <option value={1000}>Millimetres</option>
                <option value={1 / 0.3048}>Feet</option>
                <option value={1 / 0.0254}>Inches</option>
              </select>
            </label>
            <label>
              Export up axis
              <select
                value={exportUp}
                onChange={(e) => setExportUp(e.target.value as 'y' | 'z')}
              >
                <option value="z">Z up</option>
                <option value="y">Y up</option>
              </select>
            </label>
          </>
        )}
        <p>
          Standard files retain supported geometry and materials. Architectural
          parameters, review records, and undo history remain in this project.
          OBJ retains diffuse appearance; STL has no materials.
        </p>
        <ModelButton icon={<Download />} onClick={exportFiles}>
          Prepare export
        </ModelButton>
        {download && (
          <a
            className="model-button"
            href={download.url}
            download={download.name}
          >
            Download {download.name}
          </a>
        )}
      </fieldset>
      {busy && (
        <ModelButton icon={<X />} onClick={() => task.current?.abort()}>
          Cancel file operation
        </ModelButton>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
