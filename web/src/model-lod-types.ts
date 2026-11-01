import type { PackageAsset, Position } from './types.js';

export type ModelLod = 0 | 1 | 2;
export interface DetailedModelAsset extends PackageAsset {
  encoding?: 'gzip';
  decodedBytes?: number;
}
export interface ModelTextureCredit {
  photoId: string;
  author: string;
  license: string;
  licenseUrl: string;
  sourceUrl?: string;
  attribution: string;
  modifications: string;
}
export interface DetailedModelLevel {
  level: ModelLod;
  /** Conservative bound on omitted exterior relief, in metres. */
  geometricError: number;
  triangles: number;
  geometryBytes: number;
  assets: DetailedModelAsset[];
}
export interface DetailedBuildingModel {
  version: 1;
  id: string;
  geometryRevision: string;
  detailRevision?: string;
  origin: Position;
  bounds: [Position, Position];
  levels: DetailedModelLevel[];
  textures: (PackageAsset & {
    width: number;
    height: number;
    /** Maximum distinct sampler/colour-space instances across the render levels. */
    instances?: number;
    contentType: string;
    credits?: ModelTextureCredit[];
  })[];
}
export const DETAIL_MODEL_LIMITS = {
  assetBytes: 16 * 1024 * 1024,
  residentBytes: 256 * 1024 * 1024,
  concurrency: 4,
  chunkTriangles: 30000,
};
