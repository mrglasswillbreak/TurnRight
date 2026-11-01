import fs from 'node:fs/promises';
import { evidenceHash } from './cloud.mjs';
import { validCatalogue } from '../web/src/campus-context';
import type { CampusPackage } from '../web/src/types';

export interface BaselinePin {
  campus: string;
  version: string;
  manifestHash: string;
  campusSha256: string;
  assetCount: number;
  photoAssets: number;
  buildingCount: number;
}
export function assertManifestPin(manifest: CampusPackage, pin: BaselinePin) {
  const core = manifest.assets.find((asset) => asset.url === manifest.dataUrl);
  if (
    pin.campus !== 'lasu' ||
    manifest.version !== pin.version ||
    evidenceHash(manifest) !== pin.manifestHash ||
    core?.sha256 !== pin.campusSha256 ||
    manifest.assets.length !== pin.assetCount ||
    manifest.assets.filter((asset) => asset.url.includes('/photos/')).length !==
      pin.photoAssets
  )
    throw Error(
      'The full published LASU manifest, campus or photo asset inventory changed',
    );
}
export async function verifiedPublicationBaseline() {
  const pin: BaselinePin = JSON.parse(
    await fs.readFile(
      new URL('../data/lasu-models/publication-baseline.json', import.meta.url),
      'utf8',
    ),
  );
  const read = async (pathname: string) => {
    const url = new URL(pathname, process.env.PUBLISHED_MAP_URL);
    if (url.protocol !== 'https:')
      throw Error('Model campaign publication baseline must use HTTPS');
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw Error('Published catalogue or manifest unavailable');
    return response.json();
  };
  const catalogue = await read('/packages/campuses.json');
  if (!validCatalogue(catalogue))
    throw Error('Published campus catalogue is invalid');
  const campus = catalogue.campuses.find((entry) => entry.id === 'lasu');
  if (
    !campus?.manifestUrl ||
    !/^\/packages\/[\w-]+\/manifest\.json$/.test(campus.manifestUrl)
  )
    throw Error('Published LASU catalogue entry is absent');
  const manifest = (await read(campus.manifestUrl)) as CampusPackage;
  assertManifestPin(manifest, pin);
  return {
    pin,
    catalogueHash: evidenceHash(catalogue),
    otherCampusesHash: evidenceHash(
      catalogue.campuses.filter((entry) => entry.id !== 'lasu'),
    ),
  };
}
