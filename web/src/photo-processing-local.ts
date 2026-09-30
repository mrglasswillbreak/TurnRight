import { validatePhotoRecipe, type PhotoRecipe } from './photo-edit';
import { thumbnailSize } from './photo-thumbnail';
import { encodePhotoPixels } from './photo-codecs';
import { compressToTarget } from './photo-compression';
export interface PhotoOutput {
  blob: Blob;
  width: number;
  height: number;
  targetMet: boolean;
  quality: number;
}
const canvas = (w: number, h: number): OffscreenCanvas | HTMLCanvasElement => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};
const context = (c: OffscreenCanvas | HTMLCanvasElement) =>
  c.getContext('2d', { willReadFrequently: true }) as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D;
export async function processPhoto(
  file: Blob,
  r: PhotoRecipe,
  onStage: (stage: string) => void = () => {},
  signal?: AbortSignal,
): Promise<PhotoOutput> {
  validatePhotoRecipe(r);
  signal?.throwIfAborted();
  if (
    !file.size ||
    file.size > 25 * 1024 * 1024 ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    !(await thumbnailSize(file))
  )
    throw Error(
      'Use a single JPEG, PNG or WebP up to 25 MiB and 40 megapixels.',
    );
  onStage('Reading and orienting image');
  const header = new Uint8Array(await file.slice(0, 262144).arrayBuffer()),
    view = new DataView(header.buffer);
  const tag = (start: number) =>
    String.fromCharCode(...header.slice(start, start + 4));
  if (
    (tag(12) === 'VP8X' && header[20] & 2) ||
    (tag(0) === 'RIFF' && tag(12) === 'ANIM')
  )
    throw Error(
      'Animated images are not supported. Choose a still photograph.',
    );
  if (header[0] === 137 && tag(12) === 'IHDR')
    for (let i = 8; i + 12 <= header.length;) {
      const length = view.getUint32(i),
        kind = tag(i + 4);
      if (kind === 'acTL')
        throw Error(
          'Animated images are not supported. Choose a still photograph.',
        );
      if (kind === 'IDAT') break;
      i += 12 + length;
    }
  const image = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  });
  const surfaces: (OffscreenCanvas | HTMLCanvasElement)[] = [];
  try {
    signal?.throwIfAborted();
    if (image.width * image.height > 40_000_000)
      throw Error('Reduce the source to 40 megapixels.');
    const angle = (r.rotation * Math.PI) / 180,
      a = Math.abs(Math.cos(angle)),
      b = Math.abs(Math.sin(angle)),
      sw = image.width * r.crop.width,
      sh = image.height * r.crop.height;
    const scale = Math.min(
      1,
      Math.min(r.width, 4096) / Math.max(sw * a + sh * b, sw * b + sh * a),
    );
    const w = Math.max(1, Math.round(image.width * r.crop.width * scale)),
      h = Math.max(1, Math.round(image.height * r.crop.height * scale));
    const radians = (r.rotation * Math.PI) / 180,
      cos = Math.abs(Math.cos(radians)),
      sin = Math.abs(Math.sin(radians));
    const cw = Math.max(1, Math.round(w * cos + h * sin)),
      ch = Math.max(1, Math.round(w * sin + h * cos));
    const c = canvas(cw, ch);
    surfaces.push(c);
    const ctx = context(c);
    if (!ctx) throw Error('Image processing is unavailable in this browser.');
    onStage('Applying crop, rotation and colour');
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate(radians);
    ctx.scale(r.flipX ? -1 : 1, r.flipY ? -1 : 1);
    ctx.drawImage(
      image,
      image.width * r.crop.x,
      image.height * r.crop.y,
      image.width * r.crop.width,
      image.height * r.crop.height,
      -w / 2,
      -h / 2,
      w,
      h,
    );
    ctx.restore();
    // Explicit pixel operations give the same controls on engines without canvas filters.
    if (r.exposure || r.contrast !== 1 || r.saturation !== 1 || r.temperature) {
      const pixels = ctx.getImageData(0, 0, cw, ch),
        p = pixels.data,
        gain = 2 ** r.exposure;
      for (let i = 0; i < p.length; i += 4) {
        const luminance = 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
        for (let k = 0; k < 3; k++)
          p[i + k] =
            ((luminance + (p[i + k] - luminance) * r.saturation) * gain - 128) *
              r.contrast +
            128 +
            (k === 0 ? 1 : k === 2 ? -1 : 0) * r.temperature * 30;
      }
      ctx.putImageData(pixels, 0, 0);
    }
    onStage('Flattening privacy areas');
    for (const m of r.masks) {
      const x = Math.floor(m.x * cw),
        y = Math.floor(m.y * ch),
        mw = Math.max(1, Math.ceil(m.width * cw)),
        mh = Math.max(1, Math.ceil(m.height * ch));
      if (m.mode === 'redact') {
        ctx.fillStyle = '#111827';
        ctx.fillRect(x, y, mw, mh);
        continue;
      }
      const small = canvas(
        Math.max(1, Math.ceil(mw / 18)),
        Math.max(1, Math.ceil(mh / 18)),
      );
      surfaces.push(small);
      const sc = context(small);
      sc.drawImage(c, x, y, mw, mh, 0, 0, small.width, small.height);
      ctx.imageSmoothingEnabled = m.mode === 'blur';
      ctx.drawImage(small, 0, 0, small.width, small.height, x, y, mw, mh);
      ctx.imageSmoothingEnabled = true;
    }
    if (r.format === 'image/jpeg') {
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = 'source-over';
    }
    const pixels = ctx.getImageData(0, 0, cw, ch);
    const encode = async (q: number) => {
      signal?.throwIfAborted();
      onStage(
        `Compressing ${r.format.split('/')[1]} · quality ${Math.round(q * 100)}`,
      );
      const blob = await encodePhotoPixels(pixels, r, q);
      signal?.throwIfAborted();
      return blob;
    };
    const result = await compressToTarget(r, encode);
    signal?.throwIfAborted();
    return {
      ...result,
      width: cw,
      height: ch,
    };
  } finally {
    image.close();
    surfaces.forEach((c) => {
      c.width = c.height = 1;
    });
  }
}
