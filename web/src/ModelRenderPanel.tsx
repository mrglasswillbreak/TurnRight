import { useEffect, useRef, useState } from 'react';
import type { ModelDocument } from './model-document';
import type { ModelMesh } from './visual-types';
import type { ModelRenderView } from './model-render-export';
import { ModelButton } from './ModelButton';

export function ModelRenderPanel({
  document,
  native,
}: {
  document: ModelDocument;
  native: () => Promise<ModelMesh[]>;
}) {
  const [view, setView] = useState<ModelRenderView>('oblique-sw'),
    [size, setSize] = useState(2400);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [download, setDownload] = useState('');
  const task = useRef<AbortController | null>(null);
  useEffect(() => {
    task.current?.abort();
    task.current = null;
    setBusy(false);
    setDownload('');
    setError('');
    return () => task.current?.abort();
  }, [document, view, size]);
  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download);
    },
    [download],
  );
  const prepare = async () => {
    const controller = new AbortController();
    task.current?.abort();
    task.current = controller;
    setBusy(true);
    setError('');
    setDownload('');
    try {
      const { createModelRenderExport } = await import('./model-render-export');
      const meshes = document.replaceVisual ? [] : await native();
      controller.signal.throwIfAborted();
      const exporter = await createModelRenderExport(document, meshes, size);
      try {
        controller.signal.throwIfAborted();
        const blob = await exporter.render(view);
        controller.signal.throwIfAborted();
        setDownload(URL.createObjectURL(blob));
      } finally {
        exporter.dispose();
      }
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (task.current === controller) setBusy(false);
    }
  };
  return (
    <fieldset disabled={busy}>
      <legend>Building render</legend>
      <label>
        View
        <select
          value={view}
          onChange={(e) => setView(e.target.value as ModelRenderView)}
        >
          {(
            [
              'north',
              'east',
              'south',
              'west',
              'roof',
              'oblique-ne',
              'oblique-sw',
            ] as const
          ).map((v) => (
            <option value={v} key={v}>
              {v.replaceAll('-', ' ')}
            </option>
          ))}
        </select>
      </label>
      <label>
        Image width
        <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
          <option value={1024}>1024 pixels</option>
          <option value={2400}>2400 pixels</option>
          <option value={4096}>4096 pixels</option>
        </select>
      </label>
      <ModelButton onClick={() => void prepare()}>
        {busy ? 'Rendering…' : 'Prepare PNG'}
      </ModelButton>
      {download && (
        <a
          className="model-button"
          href={download}
          download={`building-${view}.png`}
        >
          Download building render
        </a>
      )}
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
