import fs from "node:fs/promises";
import path from "node:path";

export function glyphRanges(data) {
  const names = [
    ...data.places.map((p) => p.name),
    ...data.map.features.map((f) => String(f.properties?.name || "")),
  ];
  const ranges = new Set([0]);
  for (const name of names)
    for (const char of name + name.toUpperCase()) {
      const code = char.codePointAt(0);
      if (code <= 65535) ranges.add(Math.floor(code / 256) * 256);
    }
  if (ranges.size > 64) throw new Error("Campus labels exceed the bounded offline glyph budget.");
  return [...ranges].sort((a, b) => a - b).map((start) => `${start}-${start + 255}`);
}
export async function packageGlyphs(data, publicDir, asset) {
  for (const range of glyphRanges(data)) {
    const url = `/glyphs/Open%20Sans%20Semibold/${range}.pbf`;
    let bytes = await fs.readFile(path.join(publicDir, decodeURIComponent(url))).catch(() => null);
    if (!bytes) {
      const response = await fetch(
        `https://demotiles.maplibre.org/font/Open%20Sans%20Semibold/${range}.pbf`,
        { signal: AbortSignal.timeout(30000) },
      );
      if (!response.ok)
        throw new Error(
          `Offline label glyphs unavailable for ${range}. Keep the preceding release.`,
        );
      bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 1_000_000 || bytes[0] !== 0x0a)
        throw new Error("Invalid offline glyph response.");
    }
    await asset(url, bytes, "application/x-protobuf");
  }
}
