import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { MeshTextureTools } from '../../src/MeshTextureTools';
import { useModelMesh } from '../../src/useModelMesh';
import { primitive } from '../../src/model-primitives';
import { newModelDocument, type ModelDocument } from '../../src/model-document';
import type { EditorWorkspace } from '../../src/editor-workspace';
import type { MapEdit, CampusPhoto } from '../../src/types';
import { campusFixture } from '../fixture';
import { render } from './render';
import { click, fill } from './interact';

afterEach(() => vi.unstubAllGlobals());
async function fixture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#884422';
  context.fillRect(0, 0, 16, 16);
  const image = canvas.toDataURL('image/png'),
    bytes = await (await fetch(image)).arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
  const source = newModelDocument([3.2, 6.46]),
    object = primitive('plane');
  source.objects.push(object);
  const data = campusFixture();
  data.photos = [
    {
      id: 'reference',
      buildingId: 'building',
      url: image,
      sha256: hash,
      bytes: bytes.byteLength,
      caption: 'Verified surface',
      alt: 'Verified material reference',
      modifications: 'None',
      checkedAt: '2026-11-01',
      width: 16,
      height: 16,
      author: 'Test',
      license: 'CC0 1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attribution: 'Test',
    } satisfies CampusPhoto,
  ];
  const commit = vi.fn(() => true),
    preview = vi.fn(),
    recoverModelInput = vi.fn();
  const workspace = {
    modelInputs: {
      building: {
        [`mesh-texture:${object.id}`]: JSON.stringify({
          photoId: 'reference',
          corners: [
            [0.1, 0.1],
            [0.9, 0.1],
            [0.9, 0.9],
            [0.1, 0.9],
          ],
        }),
      },
    },
    recoverModelInput,
  } as unknown as EditorWorkspace;
  function Editor() {
    const [edit, setEdit] = useState<MapEdit>({
      id: 'building',
      kind: 'building',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [3.2, 6.46],
            [3.2001, 6.46],
            [3.2001, 6.4601],
            [3.2, 6.4601],
            [3.2, 6.46],
          ],
        ],
      },
      properties: { modelDocument: source },
    });
    const [selection, onSelection] = useState({
      objectId: object.id,
      kind: 'face' as const,
      ids: object.faces.map((f) => f.id),
    });
    const state = useModelMesh({
      edit,
      data,
      scene: null,
      selection,
      onSelection: (next) => onSelection({ ...next, kind: 'face' }),
      onPreview: preview,
      workspace,
      view: 'mesh',
      disabled: false,
      onCommit: (next) => {
        const ok = commit();
        if (ok) setEdit(next);
        return ok;
      },
    });
    return (
      <>
        <MeshTextureTools state={state} />
        <output data-testid="textured-model">
          {JSON.stringify(state.document)}
        </output>
      </>
    );
  }
  return { Editor, commit, preview, recoverModelInput, source };
}
it('restores the crop, previews without mutation, cancels and commits one immutable textured document', async () => {
  const f = await fixture();
  await render(<f.Editor />);
  await expect
    .element(page.getByLabelText('Top left X', { exact: true }))
    .toHaveValue(0.1);
  await fill('Top left X', '0.2');
  expect(f.recoverModelInput).toHaveBeenCalled();
  await click('Preview texture');
  await vi.waitFor(() =>
    expect(
      f.preview.mock.calls.some(([value]) => value?.images.length === 1),
    ).toBe(true),
  );
  expect(f.commit).not.toHaveBeenCalled();
  expect(f.source.images).toHaveLength(0);
  await click('Cancel texture');
  expect(f.preview).toHaveBeenLastCalledWith(null);
  await click('Preview texture');
  await expect
    .element(page.getByRole('button', { name: 'Apply texture', exact: true }))
    .toBeEnabled();
  await click('Apply texture');
  expect(f.commit).toHaveBeenCalledTimes(1);
  const document = JSON.parse(
    page.getByTestId('textured-model').element().textContent!,
  ) as ModelDocument;
  expect(document.images).toHaveLength(1);
  expect(document.images[0].evidence?.photoId).toBe('reference');
  expect(
    document.objects[0].faces.every((face) => face.corners.every((c) => c.uv)),
  ).toBe(true);
});
