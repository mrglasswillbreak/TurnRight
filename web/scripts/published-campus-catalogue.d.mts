import type { CampusCatalogue, CampusIdentity } from '../src/campus-context.js';
import type { CampusPackage } from '../src/types.js';
export function catalogueRevision(catalogue: CampusCatalogue): string;
export function readPublishedCatalogue(
  origin: string,
): Promise<{ catalogue: CampusCatalogue; revision: string }>;
export function preserveCampusCatalogue(
  publicDir: string,
  origin: string,
  options?: {
    expectedRevision?: string;
    replacement?: { campus: CampusIdentity; manifest: CampusPackage };
  },
): Promise<{
  catalogue: CampusCatalogue;
  revision: string;
  previousRevision: string;
}>;
