import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/lib/theme-context';
import { LocaleProvider } from '@/lib/i18n';
import { ServiceWorkerRegister } from '@/components/common/ServiceWorkerRegister';

export const metadata: Metadata = {
  title: 'Foody Admin',
  description: 'Restaurant management portal',
  manifest: '/manifest.json',
  applicationName: 'Foody Admin',
  appleWebApp: {
    capable: true,
    title: 'Foody Admin',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    // C2 artwork; the raster assets are composed for OS-applied icon masks.
    icon: [
      { url: '/brand/favicon.svg?v=c2', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png?v=c2', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png?v=c2', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png?v=c2', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#eb5204',
  // Allow user pinch-zoom (accessibility); the iOS focus-zoom is handled by
  // forcing inputs to 16px on mobile (see globals.css).
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var l = localStorage.getItem('foody-admin-locale') || navigator.language.split('-')[0];
                if (['en', 'fr', 'he'].includes(l)) { document.documentElement.lang = l; document.documentElement.dir = l === 'he' ? 'rtl' : 'ltr'; }
                var t = localStorage.getItem('foody_admin_theme');
                if (t === 'dark') document.documentElement.classList.add('dark');
                else document.documentElement.classList.remove('dark');
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body>
        <ServiceWorkerRegister />
        <ThemeProvider>
          <LocaleProvider>{children}</LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
