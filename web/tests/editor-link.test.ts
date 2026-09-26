import { expect, it } from 'vitest';
import {
  consumeEditorBuilding,
  editorHref,
  editorSignInReturn,
  requestedEditorBuilding,
  publicEditorHref,
  restoreEditorCampusReturn,
} from '../src/editor-link';
import { campusFixture } from './fixture';

it('encodes a building ID and keeps an empty selection at the ordinary editor', () => {
  expect(editorHref('wall & wing/1')).toBe(
    '/admin?building=wall%20%26%20wing%2F1',
  );
  expect(editorHref()).toBe('/admin');
  const data = campusFixture();
  expect(
    publicEditorHref(data, { ...data.places[0], buildingId: 'building' }),
  ).toBe('/admin?building=building');
  expect(publicEditorHref(data, null, 'footprint')).toBe(
    '/admin?building=footprint',
  );
});
it('restores another campus through the existing exact OAuth callback',()=>{
  const values=new Map<string,string>();
  const storage={getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
  expect(editorSignInReturn('https://turnright.vercel.app/admin?campus=north-campus&building=library',storage)).toBe('https://turnright.vercel.app/admin');
  const restored=restoreEditorCampusReturn('https://turnright.vercel.app/admin?code=oauth-code',storage);
  expect(restored).toBe('/admin?code=oauth-code&campus=north-campus&building=library');
  expect(requestedEditorBuilding('https://turnright.vercel.app/admin?campus=north-campus',storage)).toBe('library');
  expect(requestedEditorBuilding('https://turnright.vercel.app/admin',storage)).toBeUndefined();
  expect(restoreEditorCampusReturn('https://turnright.vercel.app/admin',storage)).toBeNull();
});
it('retains a target through OAuth and consumes it without touching other URL state', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (k: string) => values.get(k) || null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
  };
  const url =
    'https://turnright.vercel.app/admin?building=library&other=1#anchor';
  expect(editorSignInReturn(url, storage)).toBe(
    'https://turnright.vercel.app/admin',
  );
  expect(
    requestedEditorBuilding('https://turnright.vercel.app/admin', storage),
  ).toBe('library');
  expect(
    requestedEditorBuilding(
      'https://turnright.vercel.app/admin?building=another',
      storage,
    ),
  ).toBe('another');
  expect(consumeEditorBuilding(url, storage)).toBe('/admin?other=1#anchor');
  expect(
    requestedEditorBuilding('https://turnright.vercel.app/admin', storage),
  ).toBeUndefined();
});
it('rejects empty or oversized identities and restricts redirect to this origin', () => {
  expect(
    requestedEditorBuilding('https://site.test/admin?building='),
  ).toBeUndefined();
  expect(
    requestedEditorBuilding(
      `https://site.test/admin?building=${'a'.repeat(201)}`,
    ),
  ).toBeUndefined();
  expect(
    editorSignInReturn(
      'https://site.test/admin?building=library&redirect=https://elsewhere.test',
    ),
  ).toBe('https://site.test/admin?building=library');
});
