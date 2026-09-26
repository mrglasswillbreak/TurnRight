import type { ModelDocument, Vec3 } from './model-document';
export type ModelFileFormat = 'glb' | 'gltf' | 'obj' | 'stl';
export type ModelFile = { name: string; data: ArrayBuffer };
export type ModelImport = {
  document: ModelDocument;
  warnings: string[];
  missing: string[];
  dimensions: Vec3;
  vertices: number;
  faces: number;
  filename: string;
};
export type ModelImportOptions = {
  scale: number;
  up: 'y' | 'z';
  centre: boolean;
};
export type ModelExportOptions = {
  format: ModelFileFormat;
  scale: number;
  up: 'y' | 'z';
};
export const MODEL_FILE_BYTES = 50 * 1024 * 1024;
