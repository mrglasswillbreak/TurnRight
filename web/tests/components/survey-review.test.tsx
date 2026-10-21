import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { SurveyReview } from '../../src/SurveyReview';
import {
  newSurvey,
  reviewCommand,
  type SurveyLine,
} from '../../src/survey-model';
import type { SurveySessionState, Selection } from '../../src/useSurveySession';
import type { Position } from '../../src/types';
import { campusFixture } from '../fixture';
import { render } from './render';
import { click, fill, toggle } from './interact';

function fixture(marker = false) {
  const session = newSurvey('owner', 'fixture').session;
  session.state = 'review';
  session.review = [
    {
      id: 'line-one',
      reviewed: false,
      vertices: Array.from({ length: 6 }, (_, i) => ({
        id: `v${i}`,
        coordinates: [3.2 + i * 0.0001, 6.46] as Position,
        sampleId: `s${i}`,
      })),
    },
  ];
  if (marker) {
    session.markers = [
      {
        id: 'door',
        name: 'Library door',
        sampleId: 's1',
        placeId: 'library',
        access: 'yes',
        coordinates: session.review[0].vertices[1].coordinates,
        accuracy: 3,
      },
    ];
    session.review[0].vertices[1].pinned = true;
  }
  const persist = vi.fn(async () => {}),
    resume = vi.fn(async () => {}),
    placeHere = vi.fn(),
    setMarker = vi.fn(),
    easeTo = vi.fn();
  function Editor() {
    const [, redraw] = useState(0),
      [error, setError] = useState('');
    const [selection, setSelection] = useState<Selection | null>(
      marker ? { marker: 'door' } : { line: 'line-one', vertex: 1 },
    );
    const [connect, setConnect] = useState(false),
      [cutStart, setCutStart] = useState<number | null>(null);
    const changed = () => redraw((n) => n + 1);
    const command = (change: Parameters<typeof reviewCommand>[1]) => {
      try {
        reviewCommand(session, change);
        setError('');
        changed();
      } catch (e) {
        setError((e as Error).message);
      }
    };
    const selectedLine = session.review.find(
      (l) => selection && 'line' in selection && l.id === selection.line,
    );
    const state = {
      session,
      changed,
      persist: async () => {
        await persist();
        changed();
      },
      resume,
      command,
      attempt: async (work: () => Promise<void>) => {
        try {
          await work();
        } catch (e) {
          setError((e as Error).message);
        }
      },
      data: campusFixture(),
      edits: [],
      center: [3.2001, 6.46],
      map: { easeTo },
      selectedLine,
      selectedMarker: session.markers.find(
        (m) => selection && 'marker' in selection && m.id === selection.marker,
      ),
      vertexIndex: selection && 'vertex' in selection ? selection.vertex : 0,
      setSelection,
      connect,
      setConnect,
      cutStart,
      setCutStart,
      placeHere,
      setMarker,
      editLine: (change: (l: SurveyLine) => void) =>
        command((s) =>
          change(s.review.find((l) => l.id === selectedLine?.id)!),
        ),
    } as unknown as SurveySessionState;
    return (
      <>
        <SurveyReview state={state} />
        {error && <p role="alert">{error}</p>}
      </>
    );
  }
  return { Editor, session, persist, resume, placeHere, setMarker, easeTo };
}

it('edits, splits, undoes and reviews a recorded section without losing its vertex identities', async () => {
  const f = fixture();
  await render(<f.Editor />);
  await fill('Survey name', 'North-campus walk');
  await click('Section 1 · Needs review');
  expect(f.session.name).toBe('North-campus walk');
  expect(f.persist).toHaveBeenCalled();
  expect(f.easeTo).toHaveBeenCalledWith({ center: [3.2, 6.46], zoom: 19 });
  await fill('Observed street name', 'Library walk');
  await click('Next vertex');
  await click('Insert vertex after');
  expect(f.session.review[0].vertices).toHaveLength(7);
  await click('Delete vertex');
  expect(f.session.review[0].vertices.map((v) => v.id)).toEqual([
    'v0',
    'v1',
    'v2',
    'v3',
    'v4',
    'v5',
  ]);
  await click('Split here');
  expect(f.session.review.map((l) => l.vertices.map((v) => v.id))).toEqual([
    ['v0', 'v1'],
    ['v1', 'v2', 'v3', 'v4', 'v5'],
  ]);
  await click('Undo survey edit');
  expect(f.session.review).toHaveLength(1);
  await click('Redo survey edit');
  expect(f.session.review).toHaveLength(2);
  await toggle('Connect to highlighted target');
  await click('Place here');
  expect(f.placeHere).toHaveBeenCalledOnce();
  await click('Confirm section reviewed');
  expect(f.session.review[0]).toMatchObject({
    name: 'Library walk',
    reviewed: true,
  });
  await click('Previous vertex');
  await click('Remove whole section');
  expect(f.session.review).toHaveLength(1);
  await click('Draw connecting section');
  expect(f.session.review.at(-1)?.vertices[0].coordinates).toEqual([
    3.2001, 6.46,
  ]);
  await click('Confirm section reviewed');
  expect(page.getByRole('alert').element().textContent).toContain(
    'at least two vertices',
  );
  expect(f.session.review.at(-1)?.reviewed).toBe(false);
  await click('Rewalk missing section');
  expect(f.resume).toHaveBeenCalledOnce();
});

it('trims and removes sections with undo, while refusing to remove pinned anchors', async () => {
  const f = fixture();
  await render(<f.Editor />);
  await click('Trim before');
  expect(f.session.review[0].vertices.map((v) => v.id)).toEqual([
    'v1',
    'v2',
    'v3',
    'v4',
    'v5',
  ]);
  await click('Undo survey edit');
  await click('Next vertex');
  await click('Trim after');
  expect(f.session.review[0].vertices.map((v) => v.id)).toEqual(['v0', 'v1']);
  await click('Undo survey edit');
  await click('Start section removal');
  await click('Remove to this vertex');
  expect(page.getByRole('alert').element().textContent).toContain('other end');
  expect(f.session.review[0].vertices).toHaveLength(6);
  await click('Start section removal');
  await click('Next vertex');
  await click('Next vertex');
  await click('Remove to this vertex');
  expect(f.session.review.map((l) => l.vertices.map((v) => v.id))).toEqual([
    ['v0', 'v1'],
    ['v3', 'v4', 'v5'],
  ]);
  await click('Undo survey edit');
  f.session.review[0].vertices[0].pinned = true;
  await click('Trim before');
  expect(page.getByRole('alert').element().textContent).toContain(
    'fixed anchor',
  );
  expect(f.session.review[0].vertices).toHaveLength(6);
});

it('editing and deleting an entrance updates its anchor without removing other vertices', async () => {
  const f = fixture(true);
  await render(<f.Editor />);
  await click('Edit entrance details');
  expect(f.setMarker).toHaveBeenCalledWith(f.session.markers[0]);
  expect(f.setMarker.mock.calls[0][0]).not.toBe(f.session.markers[0]);
  expect(f.easeTo).toHaveBeenCalledWith({
    center: f.session.markers[0].coordinates,
    zoom: 20,
    pitch: 0,
  });
  await click('Delete entrance');
  expect(f.session.markers).toEqual([]);
  expect(f.session.review[0].vertices).toHaveLength(6);
  expect(f.session.review[0].vertices[1].pinned).toBe(false);
});
