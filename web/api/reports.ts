import { lasuCampus } from '../src/campus-context.js';
import { resolveCampus } from '../server/campuses.js';
import { withCampusId } from '../server/campus-scope.js';
import {
  bodyOf,
  db,
  fail,
  hash,
  HttpError,
  privateHeaders,
  type RequestLike,
  type ResponseLike,
} from '../server/backend.js';
export default async function handler(req: RequestLike, res: ResponseLike) {
  privateHeaders(res);
  try {
    const body = bodyOf(req, 5000);
    if (body.website) {
      res.status(200).json({ accepted: true });
      return;
    }
    const campus =
      !body.campus || body.campus === 'lasu'
        ? lasuCampus
        : await resolveCampus(body.campus);
    await withCampusId(campus.id, async () => {
      const { coordinates, description, category, placeId } = body;
      if (
        !Array.isArray(coordinates) ||
        coordinates.length !== 2 ||
        coordinates.some(
          (n: unknown) => typeof n !== 'number' || !Number.isFinite(n),
        ) ||
        coordinates[0] < campus.bounds[0][0] ||
        coordinates[0] > campus.bounds[1][0] ||
        coordinates[1] < campus.bounds[0][1] ||
        coordinates[1] > campus.bounds[1][1]
      )
        throw new HttpError(400, 'Choose a pin within the selected campus.');
      if (
        typeof description !== 'string' ||
        description.trim().length < 10 ||
        description.length > 1000
      )
        throw new HttpError(
          400,
          'Use a description between 10 and 1,000 characters.',
        );
      if (
        !['incorrect-place', 'blocked-path', 'missing-path', 'other'].includes(
          category,
        )
      )
        throw new HttpError(400, 'Choose a report category.');
      if (
        placeId !== undefined &&
        (typeof placeId !== 'string' || placeId.length > 180)
      )
        throw new HttpError(400, 'Invalid place identifier.');
      if (!process.env.REPORT_RATE_SALT)
        throw new HttpError(
          503,
          'Report submission is not configured yet. Save a draft for now.',
        );
      // Vercel supplies this address; no raw IP is stored. Rotate buckets daily.
      const ip =
        req.headers['x-vercel-forwarded-for'] ||
        req.headers['x-forwarded-for'] ||
        'unknown';
      const key = hash(
        `${process.env.REPORT_RATE_SALT}:${new Date().toISOString().slice(0, 10)}:${String(ip).split(',')[0]}`,
      );
      const allowed = await db<boolean>('rpc/consume_report_slot', 'POST', {
        bucket_key: key,
      });
      if (!allowed)
        throw new HttpError(
          429,
          'Too many reports. Please wait an hour before submitting another.',
        );
      await db(
        'reports',
        'POST',
        {
          coordinates,
          place_id: placeId || null,
          category,
          description: description.trim(),
        },
        'return=minimal',
      );
      res.status(201).json({ accepted: true });
    });
  } catch (error) {
    fail(res, error);
  }
}
