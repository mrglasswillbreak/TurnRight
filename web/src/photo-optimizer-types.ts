import type { CampusPhoto } from './types';
export interface PhotoOptimizerRequest {
  files?: File[];
  photo?: CampusPhoto;
  localId?: string;
  metadata?: Partial<CampusPhoto>;
  replacesJob?: string;
  original?: CampusPhoto;
}
