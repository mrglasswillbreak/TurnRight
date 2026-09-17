import { db } from './backend.js';
import type { PublishedWorkspace } from '../src/editor-publication.js';

export async function publishedWorkspace(): Promise<PublishedWorkspace | null> {
  // Publication time also identifies a restored older release. Read only the
  // correction snapshot, not the large source/geometry snapshot or its history.
  const [published] = await db<PublishedWorkspace[]>(
    'releases?select=version,edits:snapshot->edits&status=eq.published&published_at=not.is.null&order=published_at.desc&limit=1',
  );
  return published || null;
}
