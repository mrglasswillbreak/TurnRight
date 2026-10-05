import { api } from './supabase';
import type { GisActionMap } from './gis-types';
export const gisApi = <A extends keyof GisActionMap>(
  action: A,
  payload: GisActionMap[A]['request'],
) =>
  api<GisActionMap[A]['response']>(action, payload, {
    timeoutMs: 80000,
    retries: 0,
  });
