import capabilities from '../../scripts/map_import/capabilities.json' with { type: 'json' };

export const mapFormats = capabilities;
const extensions = new Set(capabilities.flatMap((format) => format.extensions));
export const mapFileAccept = [...extensions].map((extension) => `.${extension}`).join(',');
export function supportedMapFilename(name: string) {
  return extensions.has(name.split('.').at(-1)?.toLowerCase() || '');
}
