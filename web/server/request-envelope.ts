import { bodyOf, HttpError, isObject, type RequestLike } from './backend.js';

export function adminEnvelope(req: RequestLike) {
  const body = bodyOf(req, 3_000_000);
  const { action, payload = {}, campus = 'lasu' } = body;
  if (typeof action !== 'string' || !/^[a-z][a-z-]{0,63}$/.test(action))
    throw new HttpError(400, 'Choose a valid administration action.');
  if (!isObject(payload))
    throw new HttpError(400, 'Use an object for the action payload.');
  if (typeof campus !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(campus))
    throw new HttpError(400, 'Choose a valid campus.');
  return { action, payload, campus };
}
