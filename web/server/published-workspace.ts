import { db, HttpError } from './backend.js';
import type { PublishedWorkspace } from '../src/editor-publication.js';

export async function publishedWorkspace(): Promise<PublishedWorkspace | null> {
  // Read the separately materialized correction summary. Extracting a JSON field
  // from snapshot still decompresses the entire map during every status poll.
  const [published] = await db<PublishedWorkspace[]>(
    'releases?select=version,edits:editor_edits&status=eq.published&published_at=not.is.null&order=published_at.desc,id.desc&limit=1',
  );
  if (published && !Array.isArray(published.edits))
    throw new HttpError(
      503,
      'The published correction summary is being prepared. Your local work is retained.',
      'database',
    );
  return published || null;
}
