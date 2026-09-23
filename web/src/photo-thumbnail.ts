/** Read bounded headers before asking the browser to decode a private thumbnail. */
export async function thumbnailSize(
  file: Blob,
): Promise<{ width: number; height: number } | null> {
  const bytes = new Uint8Array(await file.slice(0, 262144).arrayBuffer());
  const view = new DataView(bytes.buffer);
  let width = 0,
    height = 0,
    orientation = 1;
  const tag = (offset: number, value: string) =>
    [...value].every((c, i) => bytes[offset + i] === c.charCodeAt(0));
  try {
    if (bytes[0] === 137 && tag(1, 'PNG') && tag(12, 'IHDR')) {
      width = view.getUint32(16);
      height = view.getUint32(20);
    } else if (tag(0, 'RIFF') && tag(8, 'WEBP')) {
      if (tag(12, 'VP8X')) {
        width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
        height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      } else if (tag(12, 'VP8L') && bytes[20] === 47) {
        const bits = view.getUint32(21, true);
        width = 1 + (bits & 0x3fff);
        height = 1 + ((bits >>> 14) & 0x3fff);
      } else if (
        tag(12, 'VP8 ') &&
        bytes[23] === 157 &&
        bytes[24] === 1 &&
        bytes[25] === 42
      ) {
        width = view.getUint16(26, true) & 0x3fff;
        height = view.getUint16(28, true) & 0x3fff;
      }
    } else if (bytes[0] === 255 && bytes[1] === 216) {
      let offset = 2;
      while (offset + 4 < bytes.length) {
        if (bytes[offset] !== 255) break;
        const marker = bytes[offset + 1],
          length = view.getUint16(offset + 2);
        if (length < 2) break;
        if (
          [
            192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
          ].includes(marker)
        ) {
          height = view.getUint16(offset + 5);
          width = view.getUint16(offset + 7);
        }
        if (marker === 225 && tag(offset + 4, 'Exif')) {
          const tiff = offset + 10,
            little = tag(tiff, 'II'),
            ifd = tiff + view.getUint32(tiff + 4, little),
            count = view.getUint16(ifd, little);
          for (let i = 0; i < Math.min(count, 256); i++) {
            const entry = ifd + 2 + 12 * i;
            if (view.getUint16(entry, little) === 274)
              orientation = view.getUint16(entry + 8, little);
          }
        }
        if (marker === 218 || marker === 217) break;
        offset += 2 + length;
      }
    }
  } catch {
    return null;
  }
  if (!width || !height || width * height > 40_000_000) return null;
  if ([5, 6, 7, 8].includes(orientation)) [width, height] = [height, width];
  const scale = Math.min(1, 640 / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
