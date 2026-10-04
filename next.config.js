/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), usb=()" },
  { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'" },
];

const nextConfig = {
  poweredByHeader: false,
  webpack(config, { dev }) {
    // Isolated UI verification can run without a persistent webpack disk cache.
    if (dev && process.env.FOODY_PREVIEW_LOW_DISK === '1') config.cache = false;
    return config;
  },
  async redirects() {
    return [
      { source: "/:restaurantId/website", destination: "/:restaurantId/website-v3", permanent: false },
      { source: "/:restaurantId/website-v2", destination: "/:restaurantId/website-v3", permanent: false },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

module.exports = nextConfig;
