import { randomUUID } from 'node:crypto';
import type { CampusIdentity } from '../src/campus-context.js';
import { emptyCampus } from '../src/campus-context.js';
import type { CampusData, Position } from '../src/types.js';
import { finitePosition, structuralIssues } from '../src/validation.js';
import { db, HttpError } from './backend.js';
import { currentCampusId } from './campus-scope.js';
import { publishedRecords } from './release-validation.js';

export interface CampusRow extends CampusIdentity {
  boundary: CampusData['boundary'];
}
export async function resolveCampus(
  reference: unknown = 'lasu',
): Promise<CampusRow> {
  if (
    typeof reference !== 'string' ||
    !/^[a-z0-9][a-z0-9-]{0,79}$/.test(reference)
  )
    throw new HttpError(400, 'Invalid campus identity.');
  const rows = await db<CampusRow[]>(
    `campuses?or=(id.eq.${reference},slug.eq.${reference})&limit=2`,
  );
  if (rows.length !== 1)
    throw new HttpError(
      404,
      'This campus was not found. Choose a campus from the workspace.',
    );
  return rows[0];
}
export async function activeCampus() {
  return resolveCampus(currentCampusId());
}
export async function campusAction(
  action: string,
  input: Record<string, unknown>,
) {
  if (action === 'campus-list')
    return { campuses: await db<CampusRow[]>('campuses?order=name') };
  if (action !== 'campus-create')
    throw new HttpError(400, 'Unknown campus action.');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const slug = input.slug;
  if (
    !name ||
    name.length > 160 ||
    typeof slug !== 'string' ||
    !/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug) ||
    slug === 'lasu'
  )
    throw new HttpError(
      400,
      'Enter a campus name and a unique lowercase URL name.',
    );
  const boundary = input.boundary as CampusData['boundary'];
  if (
    boundary?.type !== 'Feature' ||
    !['Polygon', 'MultiPolygon'].includes(boundary.geometry?.type)
  )
    throw new HttpError(400, 'Draw or import a closed campus boundary.');
  const positions: Position[] = [];
  const walk = (v: unknown) => {
    if (finitePosition(v)) positions.push([v[0], v[1]]);
    else if (Array.isArray(v)) v.forEach(walk);
  };
  walk((boundary.geometry as { coordinates: unknown }).coordinates);
  if (positions.length < 4 || positions.length > 10000)
    throw new HttpError(400, 'Use a boundary with 4–10,000 coordinates.');
  const bounds: [Position, Position] = [
    [
      Math.min(...positions.map((p) => p[0])),
      Math.min(...positions.map((p) => p[1])),
    ],
    [
      Math.max(...positions.map((p) => p[0])),
      Math.max(...positions.map((p) => p[1])),
    ],
  ];
  if (bounds[0][0] === bounds[1][0] || bounds[0][1] === bounds[1][1])
    throw new HttpError(400, 'The boundary must enclose an area.');
  const campus: CampusRow = {
    id: `campus-${randomUUID()}`,
    slug,
    name,
    bounds,
    boundary,
  };
  const data = emptyCampus(campus, boundary);
  if (structuralIssues(data).length)
    throw new HttpError(
      400,
      'Repair the boundary before creating this campus.',
    );
  await db('rpc/create_campus', 'POST', {
    identity: campus,
    records: publishedRecords(data),
  });
  return { campus };
}
