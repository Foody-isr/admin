import { imageFrameRect, type ImageFrame } from './website-v3/image-framing';

export type WalletPlatform = 'apple' | 'google';
export type WalletBannerLayout = { shared: ImageFrame; google?: ImageFrame; apple_counter: 'below' | 'overlay' };
export const walletBannerSize = { apple: { width: 1125, height: 432 }, google: { width: 1032, height: 812 } };

/** Initial framing keeps the whole upload visible and separates the Apple balance from it. */
export function defaultBannerLayout(): WalletBannerLayout {
  return { shared: { x: 50, y: 50, zoom: 1, fit: 'contain' }, apple_counter: 'below' };
}

/** Google follows the shared frame until the restaurant chooses its own. */
export function walletFrame(layout: WalletBannerLayout, platform: WalletPlatform): ImageFrame {
  return platform === 'google' && layout.google ? layout.google : layout.shared;
}

/** Compare layout values independently of JSON member order. */
export function sameBannerLayout(a: WalletBannerLayout | null, b: WalletBannerLayout | null) {
  const equal = (x?: ImageFrame, y?: ImageFrame) => x === y ||
    (!!x && !!y && x.fit === y.fit && x.zoom === y.zoom && x.x === y.x && x.y === y.y);
  return a === b || (!!a && !!b && a.apple_counter === b.apple_counter && equal(a.shared, b.shared) && equal(a.google, b.google));
}

/** Reconstruct a browser URL for the original raster returned by the private draft. */
export function originalImageURL(base64: string): string {
  const mime = base64.startsWith('/9j/') ? 'jpeg' : base64.startsWith('UklG') ? 'webp' : 'png';
  return 'data:image/' + mime + ';base64,' + base64;
}

/** Resize uploaded or imported artwork to the Wallet preview dimensions, preserving its aspect ratio. */
export function walletThumbnail(image: HTMLImageElement, maxWidth: number): string {
  const scale = Math.min(1, maxWidth / image.naturalWidth, 320 / image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image canvas unavailable');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/** Read the exact uploaded bytes, including transparency and source resolution. */
export async function readBannerOriginal(file: File): Promise<string> {
  const result = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return originalImageURL(result.slice(result.indexOf(',') + 1));
}

/** Bake the same rectangles as the live preview into each Wallet's final raster. */
export async function renderWalletBanners(source: string, layout: WalletBannerLayout) {
  const image = new Image();
  image.src = source;
  await image.decode();
  function raster(platform: WalletPlatform) {
    const { width, height } = walletBannerSize[platform];
    const rect = imageFrameRect(width, height, image.naturalWidth, image.naturalHeight, walletFrame(layout, platform));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image canvas unavailable');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, rect.left, rect.top, rect.width, rect.height);
    return canvas.toDataURL('image/png').split(',')[1];
  }
  return { apple_strip_png: raster('apple'), google_hero_png: raster('google') };
}
