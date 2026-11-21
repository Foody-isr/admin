import type { WalletWebsiteDesign } from './api';
import { defaultBannerLayout, originalImageURL, walletBannerSize, walletThumbnail, type WalletBannerLayout } from './wallet-banner';
import type { ImageFrame } from './website-v3/image-framing';
import { colorContrast, resolveSiteColorStyle, siteHex } from './website-v3/site-colors';

type RGB = [number, number, number];
type Artwork = { thumbnail: string; dominant?: string; layout: WalletBannerLayout };
type DesignPatch = {
  background?: string; foreground?: string; logo?: string;
  banner?: string; original?: string; layout?: WalletBannerLayout;
};
const distance = (a: RGB, b: RGB) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Learn a three-color palette from opaque pixels of a small, local image sample. */
function dominantColor(pixels: Uint8ClampedArray): string | undefined {
  const samples: RGB[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] >= 160) samples.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
  }
  if (!samples.length) return;
  const centers = [samples[0]];
  while (centers.length < 3) {
    let farthest = 0;
    let candidate = samples[0];
    for (const rgb of samples) {
      const gap = Math.min(...centers.map(center => distance(rgb, center)));
      if (gap > farthest) { farthest = gap; candidate = rgb; }
    }
    if (!farthest) break;
    centers.push(candidate);
  }
  let counts: number[] = [];
  for (let iteration = 0; iteration < 8; iteration++) {
    const sums = centers.map(() => [0, 0, 0]);
    counts = centers.map(() => 0);
    for (const pixel of samples) {
      const gaps = centers.map(center => distance(pixel, center));
      const index = gaps.indexOf(Math.min(...gaps));
      counts[index]++;
      for (let c = 0; c < 3; c++) sums[index][c] += pixel[c];
    }
    for (let i = 0; i < centers.length; i++) {
      if (counts[i]) centers[i] = sums[i].map(n => Math.round(n / counts[i])) as RGB;
    }
  }
  const largest = centers[counts.indexOf(Math.max(...counts))];
  return '#' + largest.map(channel => channel.toString(16).padStart(2, '0')).join('');
}

// Weight the focus toward edges in the photograph. Cutouts and heavily cropped subjects stay whole.
function photoLayout(pixels: Uint8ClampedArray, ratio: number): WalletBannerLayout {
  const layout = defaultBannerLayout();
  let weight = 0, xSum = 0, ySum = 0, transparent = 0;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const i = 4 * (y * 32 + x);
      if (pixels[i + 3] < 160) { transparent++; continue; }
      if (!x || !y) continue;
      let edge = 0;
      for (let c = 0; c < 3; c++) edge += Math.abs(pixels[i + c] - pixels[i - 4 + c]) + Math.abs(pixels[i + c] - pixels[i - 128 + c]);
      xSum += edge * (x + 0.5) / 32;
      ySum += edge * (y + 0.5) / 32;
      weight += edge;
    }
  }
  if (transparent >= 32) return layout;
  const anchor = (center: number, visible: number) => Math.round(100 * Math.max(0, Math.min(1, (center - visible / 2) / (1 - visible))));
  const frame = (size: { width: number; height: number }): ImageFrame => {
    const scale = ratio / (size.width / size.height);
    const visible = Math.min(scale, 1 / scale);
    if (visible < 2 / 3) return { ...layout.shared };
    const result: ImageFrame = { fit: 'cover', zoom: 1, x: 50, y: 50 };
    if (visible < 0.99 && weight) {
      if (scale > 1) result.x = anchor(xSum / weight, visible);
      else result.y = anchor(ySum / weight, visible);
    }
    return result;
  };
  const shared = frame(walletBannerSize.apple);
  const google = frame(walletBannerSize.google);
  const appleLayout: WalletBannerLayout = { shared, apple_counter: 'below' };
  if (shared.fit !== google.fit || shared.x !== google.x || shared.y !== google.y) appleLayout.google = google;
  return appleLayout;
}

async function websiteArtwork(base64: string | undefined, maxWidth: number): Promise<Artwork | undefined> {
  if (!base64) return;
  const img = new Image();
  img.src = originalImageURL(base64);
  try { await img.decode(); } catch { return; }
  const { naturalWidth: w, naturalHeight: h } = img;
  if (!w || !h || w > 16384 || h > 16384 || w * h > 50_000_000) return;
  const canvas = document.createElement('canvas');
  const thumbnail = walletThumbnail(img, maxWidth);
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Image canvas unavailable');
  ctx.drawImage(img, 0, 0, 32, 32);
  const pixels = ctx.getImageData(0, 0, 32, 32).data;
  return { thumbnail, dominant: dominantColor(pixels), layout: photoLayout(pixels, w / h) };
}

/** Build a private suggestion while leaving any missing design fields untouched. */
export async function proposeWebsiteDesign(source: WalletWebsiteDesign) {
  const patch: DesignPatch = {};
  const [logo, banner] = await Promise.all([websiteArtwork(source.logo, 320), websiteArtwork(source.banner, 750)]);
  if (logo) patch.logo = logo.thumbnail;
  if (banner && source.banner) {
    patch.banner = banner.thumbnail;
    patch.original = originalImageURL(source.banner);
    patch.layout = banner.layout;
  }
  const style = resolveSiteColorStyle(source.palette);
  const background = siteHex(style?.background, '') || siteHex(source.palette?.bg, '')
    || siteHex(source.palette?.accent, '') || logo?.dominant || banner?.dominant;
  if (background) {
    const ink = siteHex(style?.title, '') || siteHex(source.palette?.ink, '');
    const foreground = ink && colorContrast(ink, background) >= 4.5 ? ink
      : colorContrast('#000000', background) > colorContrast('#ffffff', background) ? '#000000' : '#ffffff';
    patch.background = background.toUpperCase();
    patch.foreground = foreground.toUpperCase();
  }
  const missingImages = source.missing_images || Boolean(source.logo && !logo || source.banner && !banner);
  return { patch, missingImages };
}
