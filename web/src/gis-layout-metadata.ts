/** Embed a UTF-8 receipt in a standard PNG iTXt chunk without changing its pixels. */
export function pngWithReceipt(png: Uint8Array, receipt: object): Uint8Array {
  const text = new TextEncoder().encode(
    'TurnRightLayout\0\0\0\0\0' + JSON.stringify(receipt),
  );
  const chunk = new Uint8Array(text.length + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, text.length);
  chunk.set([105, 84, 88, 116], 4); // iTXt
  chunk.set(text, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(chunk.length - 4, (crc ^ 0xffffffff) >>> 0);
  // Canvas emits a standard PNG ending in the 12-byte IEND chunk.
  if (
    png.length < 20 ||
    new TextDecoder().decode(png.subarray(-8, -4)) !== 'IEND'
  )
    throw Error('The map encoder returned an invalid PNG.');
  const result = new Uint8Array(png.length + chunk.length);
  result.set(png.subarray(0, -12));
  result.set(chunk, png.length - 12);
  result.set(png.subarray(-12), result.length - 12);
  return result;
}
