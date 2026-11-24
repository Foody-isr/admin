import { imageFrameRect } from './website-v3/image-framing';
import { walletBannerSize, walletFrame, type WalletBannerLayout } from './wallet-banner';

export type Composition = {
  version: 1;
  template: 'table' | 'cafe';
  pattern: 'gingham' | 'waves' | 'none';
  accent: string;
  detail: string;
  footer: string;
  title_color: string;
  title: string;
  font: 'serif' | 'rounded' | 'sans';
  title_size: number;
  title_x: number;
  title_y: number;
  title_angle: number;
  photo_x: number;
  photo_y: number;
  photo_width: number;
  photo_height: number;
  trim_photo: boolean;
  photo_front: boolean;
  warmth: number;
  shade: number;
  pattern_size: number;
  pattern_opacity: number;
  pattern_angle: number;
  seam: number;
  logo_scale: number;
  trim_logo: boolean;
  balance: 'count' | 'fraction';
  reward: 'remaining' | 'benefit';
};
/** Compare recipe values after a manual edit or a private draft reload. */
export function sameComposition(a: Composition | null, b: Composition | null) {
  return (
    a === b || (!!a && !!b && (Object.keys(a) as (keyof Composition)[]).every((key) => a[key] === b[key]))
  );
}

export type Format = 'poster' | 'apple' | 'google';
export const formats = { ...walletBannerSize, poster: { width: 1074, height: 1344 } };
/** Upper stamp rows and illustration scale for each Wallet artwork. The Apple poster includes its native header. */
export const visitStampLayout = {
  poster: { top: 0.18, bottom: 0.41, artScale: 0.62 },
  apple: { top: 0.015, bottom: 0.61, artScale: 0.48 },
  google: { top: 0.035, bottom: 0.40, artScale: 0.72 },
} satisfies Record<Format, { top: number; bottom: number; artScale: number }>;
export const compositionPresets: Record<
  Composition['template'],
  { background: string; foreground: string; composition: Composition }
> = {
  table: {
    background: '#FBF1DB',
    foreground: '#22384A',
    composition: {
      version: 1,
      template: 'table',
      pattern: 'gingham',
      accent: '#B55131',
      detail: '#C27554',
      footer: '#FBF1DB',
      title_color: '#FFFAEF',
      title: 'À table !',
      font: 'serif',
      title_size: 65,
      title_x: 5,
      title_y: 42,
      title_angle: 0,
      photo_x: 0,
      photo_y: 15,
      photo_width: 100,
      photo_height: 48,
      trim_photo: false,
      photo_front: false,
      warmth: 24,
      shade: 73,
      pattern_size: 16,
      pattern_opacity: 36,
      pattern_angle: 5,
      seam: 59,
      logo_scale: 100,
      trim_logo: true,
      balance: 'count',
      reward: 'remaining',
    },
  },
  cafe: {
    background: '#FFBDD0',
    foreground: '#4F210F',
    composition: {
      version: 1,
      template: 'cafe',
      pattern: 'waves',
      accent: '#FFF1D9',
      detail: '#EF83A2',
      footer: '#4F210F',
      title_color: '#4F210F',
      title: 'Coffee\nClub',
      font: 'rounded',
      title_size: 69,
      title_x: 5,
      title_y: 21,
      title_angle: -6,
      photo_x: 41,
      photo_y: 19,
      photo_width: 62,
      photo_height: 41,
      trim_photo: true,
      photo_front: true,
      warmth: 0,
      shade: 0,
      pattern_size: 16,
      pattern_opacity: 74,
      pattern_angle: -18,
      seam: 60,
      logo_scale: 88,
      trim_logo: true,
      balance: 'fraction',
      reward: 'benefit',
    },
  },
};

const families = {
  serif: '"Wallet Instrument", Georgia, serif',
  rounded: '"Wallet Lilita", Arial, sans-serif',
  sans: 'Arial, sans-serif',
};
const fontLoads = new Map<string, Promise<void>>();
async function loadFont(style: Composition['font']) {
  if (style === 'sans') return;
  if (!fontLoads.has(style)) {
    const italic = style === 'serif';
    const face = new FontFace(
      italic ? 'Wallet Instrument' : 'Wallet Lilita',
      italic ? 'url(/fonts/wallet-instrument-italic.woff2)' : 'url(/fonts/wallet-lilita.woff2)',
      { style: italic ? 'italic' : 'normal' },
    );
    fontLoads.set(
      style,
      face
        .load()
        .then((loaded) => {
          document.fonts.add(loaded);
        })
        .catch((error) => {
          fontLoads.delete(style);
          throw error;
        }),
    );
  }
  await fontLoads.get(style);
}

type Surface = HTMLCanvasElement;
function surface(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Wallet artwork canvas unavailable');
  return { canvas, ctx };
}

/** Load only local raster data and optionally remove its transparent outer margin. */
export async function compositionImage(source: string | null, trim: boolean): Promise<Surface | null> {
  if (!source) return null;
  const image = new Image();
  image.src = source;
  await image.decode();
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const { canvas, ctx } = surface(
    Math.max(1, Math.round(image.width * scale)),
    Math.max(1, Math.round(image.height * scale)),
  );
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (!trim) return canvas;
  const { width: w, height: h } = canvas;
  const { data } = ctx.getImageData(0, 0, w, h);
  let left = w,
    right = -1,
    top = h,
    bottom = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] <= 8) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  if (right < left || (left === 0 && top === 0 && right === w - 1 && bottom === h - 1)) return canvas;
  const cropped = surface(right - left + 1, bottom - top + 1);
  cropped.ctx.drawImage(canvas, -left, -top);
  return cropped.canvas;
}

/** Preview and export share the same painter. Only decorative artwork is drawn here. */
export async function paintComposition(
  canvas: Surface,
  format: Format,
  c: Composition,
  background: string,
  source: Surface | null,
  layout: WalletBannerLayout,
  withStamps = false,
) {
  await loadFont(c.font);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Wallet artwork canvas unavailable');
  const size = formats[format];
  const scale = canvas.width / 420;
  const h = (size.height * 420) / size.width;
  // The strip has its own shorter composition. The Google hero has no native header on the artwork.
  const isStrip = format === 'apple';
  const stampBand = visitStampLayout[format];
  const artScale = withStamps ? stampBand.artScale : 1;
  const yScale = (isStrip ? 0.5 : 1) * artScale;
  const offset = format === 'poster' ? 0 : isStrip ? -38 : -68;
  const artworkTop = withStamps ? stampBand.bottom * h : 0;
  // Reuse the original composition below the visit rows. Its first 86 design units
  // provide header space on the ordinary poster; the stamped layout already has a header.
  const origin = withStamps ? artworkTop + 5 - 86 * yScale : offset;
  const y = (n: number) => n * yScale + origin;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 420, h);
  const seam = withStamps && isStrip
    ? artworkTop + (h - artworkTop) * c.seam / 100
    : y(c.seam * 5.68);
  function photo() {
    if (!source || !ctx) return;
    const frameWidth = c.photo_width * 4.2;
    const w = frameWidth * (c.photo_front ? artScale : 1);
    const x = c.photo_x * 4.2 + (frameWidth - w);
    const photoY = y(c.photo_y * 5.68);
    const top = withStamps ? Math.max(artworkTop, photoY) : photoY;
    const height = c.photo_height * 5.68 * yScale;
    const frame = walletFrame(layout, format === 'google' ? 'google' : 'apple');
    const rect = imageFrameRect(w, height, source.width, source.height, frame);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, top, w, height);
    ctx.clip();
    ctx.filter = 'saturate(' + (1 - c.warmth * 0.006) + ') sepia(' + c.warmth * 0.0033 + ')';
    ctx.drawImage(source, x + rect.left, top + rect.top, rect.width, rect.height);
    ctx.restore();
    if (c.shade) {
      const gradient = ctx.createLinearGradient(0, top + height * 0.45, 0, top + height);
      gradient.addColorStop(0, 'rgba(25,23,15,0)');
      gradient.addColorStop(1, 'rgba(25,23,15,' + c.shade / 100 + ')');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, top + height * 0.45, w, height * 0.55);
    }
  }
  if (!c.photo_front) photo();
  ctx.save();
  if (c.pattern === 'waves') {
    const k = c.pattern_size / 16,
      cy = y(225);
    ctx.save();
    ctx.translate(350, cy);
    ctx.rotate((c.pattern_angle * Math.PI) / 180);
    ctx.globalAlpha = c.pattern_opacity / 100;
    for (const [rx, ry, line, color] of [
      [131, 130, 17, c.detail],
      [153, 149, 6, c.accent],
    ] as const) {
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * k, ry * k * (isStrip ? 0.68 : 1), 0, 0, 2 * Math.PI);
      ctx.strokeStyle = color;
      ctx.lineWidth = line * k;
      ctx.stroke();
    }
    ctx.restore();
    for (const [delta, color] of [
      [0, c.accent],
      [9, c.footer],
    ] as const) {
      const base = seam + delta * yScale;
      ctx.beginPath();
      ctx.moveTo(0, base + 12 * yScale);
      ctx.bezierCurveTo(93, base + 58 * yScale, 142, base + 32 * yScale, 214, base - 2 * yScale);
      ctx.bezierCurveTo(285, base - 35 * yScale, 340, base - 47 * yScale, 420, base - 30 * yScale);
      ctx.lineTo(420, h + 1);
      ctx.lineTo(0, h + 1);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
  } else {
    const angle = c.pattern === 'gingham' ? (c.pattern_angle * Math.PI) / 180 : 0;
    ctx.translate(210, seam);
    ctx.transform(1, Math.tan(angle), 0, 1, 0, 0);
    ctx.fillStyle = c.footer;
    ctx.fillRect(-215, 0, 430, h + 200);
    if (c.pattern === 'gingham') {
      const band = 45 * yScale,
        step = c.pattern_size;
      ctx.beginPath();
      ctx.rect(-215, 0, 430, band);
      ctx.clip();
      ctx.fillStyle = c.detail;
      ctx.globalAlpha = c.pattern_opacity / 100;
      for (let i = -Math.ceil(215 / step) * step; i < 216; i += step) ctx.fillRect(i, 0, step / 2, band);
      for (let i = 0; i < band; i += step) ctx.fillRect(-215, i, 430, step / 2);
      ctx.fillStyle = c.accent;
      ctx.globalAlpha = 0.65;
      ctx.fillRect(-215, 0, 430, 1);
      ctx.fillRect(-215, band - 1, 430, 1);
    }
  }
  ctx.restore();
  ctx.save();
  if (withStamps) {
    ctx.beginPath();
    ctx.rect(0, artworkTop, 420, h - artworkTop);
    ctx.clip();
  }
  const textSize = c.title_size * (isStrip ? 0.63 : 1) * artScale;
  const titleY = y(c.title_y * 5.68);
  ctx.translate(c.title_x * 4.2, withStamps ? Math.max(artworkTop + 4, titleY) : titleY);
  ctx.rotate((c.title_angle * Math.PI) / 180);
  ctx.fillStyle = c.title_color;
  ctx.textBaseline = 'top';
  ctx.font = (c.font === 'serif' ? 'italic ' : '') + textSize + 'px ' + families[c.font];
  ctx.direction = /^[^A-Za-z\u0590-\u08ff]*[\u0590-\u08ff]/.test(c.title) ? 'rtl' : 'ltr';
  ctx.textAlign = 'left';
  c.title
    .split('\n')
    .forEach((line, i) => ctx.fillText(line, 0, i * textSize * (c.font === 'rounded' ? 0.85 : 1)));
  ctx.restore();
  if (c.photo_front) photo();
}

function encodeArtwork(canvas: Surface): string {
  const encode = () => canvas.toDataURL('image/png').split(',')[1];
  const fits = (png: string) =>
    (png.length * 3) / 4 - (png.endsWith('==') ? 2 : png.endsWith('=') ? 1 : 0) <= 4 * 1024 * 1024;
  let png = encode();
  if (fits(png)) return png;
  // Keep the provider's exact dimensions for exceptionally noisy full-frame photos.
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (const mask of [0xfc, 0xf8, 0xf0, 0xe0]) {
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] &= mask;
      pixels.data[i + 1] &= mask;
      pixels.data[i + 2] &= mask;
    }
    ctx.putImageData(pixels, 0, 0);
    png = encode();
    if (fits(png)) return png;
  }
  throw new Error('Wallet artwork exceeds the render limit');
}

/** Produce the three platform assets, retaining the editable source separately. */
export async function exportComposition(
  c: Composition,
  background: string,
  image: string | null,
  layout: WalletBannerLayout,
  withStamps = false,
) {
  const source = await compositionImage(image, c.trim_photo);
  async function raster(format: Format) {
    const { width, height } = formats[format];
    const { canvas } = surface(width, height);
    await paintComposition(canvas, format, c, background, source, layout, withStamps);
    return encodeArtwork(canvas);
  }
  return {
    poster_png: await raster('poster'),
    apple_strip_png: await raster('apple'),
    google_hero_png: await raster('google'),
  };
}
