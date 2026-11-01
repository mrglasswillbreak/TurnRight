import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { SurveySaved } from '../../src/SurveySaved';
import { newSurvey } from '../../src/survey-model';
import {
  listLocalSurveys,
  loadSurveyLocal,
  storeRecording,
} from '../../src/survey-storage';
import type { SurveySessionState } from '../../src/useSurveySession';
import { render } from './render';
import { click } from './interact';

const { request, openRemote } = vi.hoisted(() => ({
  request: vi.fn(),
  openRemote: vi.fn(),
}));
vi.mock('../../src/supabase', () => ({ api: request }));
vi.mock('../../src/survey-sync', () => ({ openRemoteSurvey: openRemote }));

it('preserves local recovery copies when opening and continuing conflicting cloud revisions', async () => {
  const owner = `saved-survey-${crypto.randomUUID()}`,
    local = newSurvey(owner, 'Local observations');
  local.session.name = 'Local observations';
  await storeRecording(local);
  const cloud = newSurvey(owner, 'Cloud version');
  cloud.session.id = local.session.id;
  request.mockResolvedValue({ ok: true });
  openRemote.mockImplementation(async () => structuredClone(cloud));
  const open = vi.fn(),
    archive = vi.fn(async () => {}),
    saved = vi.fn(async () => {});
  function Saved() {
    const [screen, setScreen] = useState('saved'),
      [message, setMessage] = useState('');
    const state = {
      screen,
      setScreen,
      local: [local.session],
      owner,
      open,
      archive,
      saved,
      setMessage,
      attempt: async (work: () => Promise<void>) => {
        await work();
      },
      remote: [
        {
          id: local.session.id,
          archived: false,
          head_revision: 'head',
          survey_revisions: [
            {
              id: 'head',
              name: 'Current cloud',
              status: 'ready',
              created_at: '2026-10-20T12:00:00Z',
            },
            {
              id: 'older',
              name: 'Older cloud',
              status: 'conflict',
              created_at: '2026-10-19T12:00:00Z',
            },
            {
              id: 'pending',
              name: 'Unfinished upload',
              status: 'pending',
              created_at: '2026-10-20T13:00:00Z',
            },
          ],
        },
      ],
    } as unknown as SurveySessionState;
    return (
      <>
        <SurveySaved state={state} />
        <output>{message}</output>
        <output data-testid="screen">{screen}</output>
      </>
    );
  }
  await render(<Saved />);
  expect(document.body.textContent).not.toContain('Unfinished upload');
  await click(`Local observations · ${local.session.state} · On this device`);
  await expect.poll(() => open.mock.calls.length).toBe(1);
  expect(open.mock.calls[0][0].session.id).toBe(local.session.id);
  await click('Archive');
  expect(archive).toHaveBeenCalledWith(local.session);
  const cloudButton = page.getByRole('button', { name: /^Older cloud/ });
  await cloudButton.click();
  await expect.poll(() => open.mock.calls.length).toBe(2);
  await expect
    .poll(() => document.body.textContent)
    .toContain('Conflicting version opened');
  const copies = await listLocalSurveys(owner);
  expect(
    copies.some(
      (s) => s.id !== local.session.id && s.name.includes('local copy'),
    ),
  ).toBe(true);
  await click('Continue this version');
  await expect.poll(() => open.mock.calls.length).toBe(3);
  expect(open.mock.calls.at(-1)![0].session.remoteRevision).toBe('head');
  expect((await listLocalSurveys(owner)).length).toBe(3);
  await click('Archive private survey');
  await expect.poll(() => saved.mock.calls.length).toBe(1);
  expect(request).toHaveBeenCalledWith('survey-save', {
    command: 'archive',
    surveyId: local.session.id,
    expectedRevision: 'head',
    archived: true,
  });
  expect(
    (await loadSurveyLocal(owner, local.session.id))!.session.archived,
  ).toBe(true);
  await click('Back');
  expect(page.getByTestId('screen').element().textContent).toBe('home');
});
