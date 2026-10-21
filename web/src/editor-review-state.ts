import type { MapChange, Release, StudentReport } from './types';
import type { PublishedWorkspace } from './editor-publication';
export interface ReviewState {
  published?: PublishedWorkspace | null;
  changes: MapChange[];
  hasMoreChanges?: boolean;
  reports: StudentReport[];
  jobs: {
    id: string;
    kind: string;
    status: string;
    message: string;
    created_at: string;
    completed_at?: string;
  }[];
  releases: Release[];
}
