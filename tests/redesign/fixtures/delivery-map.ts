import type { Page } from '@playwright/test';

/** Serve deterministic coastal map tiles for desktop and courier journeys. */
export async function demoTiles(page: Page) {
  await page.route('**/api/v1/public/delivery/map/**', async intercepted => {
    const match = new URL(intercepted.request().url()).pathname.match(/\/(\d+)\/(\d+)\/(\d+)\.png$/);
    if (!match) return intercepted.fallback();
    const [, z, tx, ty] = match.map(Number), world = 256 * 2 ** z;
    const point = (lat: number, lng: number) => { const sin = Math.sin(lat * Math.PI / 180); return [(lng + 180) / 360 * world - tx * 256, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world - ty * 256]; };
    const project = (points: Array<[number, number]>) => points.map(([lat, lng]) => point(lat, lng).join(',')).join(' ');
    const coast = project([[31.7, 34.7], [32.02, 34.745], [32.09, 34.765], [32.16, 34.792], [32.4, 34.825]]);
    let streets = '';
    for (let lat = 31.98; lat <= 32.25; lat += 0.008) streets += `<polyline points="${project([[lat, 34.74], [lat + 0.01, 34.92]])}" fill="none" stroke="#fff" stroke-width="3"/>`;
    for (let lng = 34.75; lng <= 34.94; lng += 0.009) streets += `<polyline points="${project([[31.98, lng], [32.25, lng + 0.02]])}" fill="none" stroke="#fff" stroke-width="3"/>`;
    const labels = ([[32.08, 34.806, 'Tel Aviv'], [32.018, 34.796, 'Holon'], [32.175, 34.85, 'Ra’anana']] as const).map(([lat, lng, label]) => { const [x, y] = point(lat, lng); return `<text x="${x}" y="${y}" font-family="Arial" font-size="15" fill="#69746e">${label}</text>`; }).join('');
    return intercepted.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#f0f0e7"/>${streets}<polygon points="-10000,-10000 -10000,10000 ${coast}" fill="#b9dce9"/>${labels}</svg>` });
  });
}
