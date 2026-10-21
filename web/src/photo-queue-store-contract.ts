import type { CampusPhoto } from './types';
import { type SignedPreview } from './photo-previews';
export interface PhotoJob extends SignedPreview {
  key: string;
  order?: number;
  target: string;
  filename: string;
  metadata: Partial<CampusPhoto>;
  mediaId?: string;
  revision: number;
  state:
    | 'queued'
    | 'uploading'
    | 'processing'
    | 'needs details'
    | 'ready'
    | 'failed';
  error?: string;
  original?: CampusPhoto;
  approved?: CampusPhoto;
  reviewed: boolean;
  rightsReviewed: boolean;
  authorshipConfirmed: boolean;
  savedDetails?: string;
  localImageId?: string;
  preparedFile?: Blob;
}

export interface PrivatePhoto extends SignedPreview {
  id: string;
  filename?: string;
  status: string;
  metadata?: Partial<CampusPhoto>;
  draft?: Partial<CampusPhoto>;
  revision: number;
  authorshipConfirmed?: boolean;
  replacesPhotoId?: string;
}

export const empty: PhotoJob[] = [];
