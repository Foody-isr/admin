import type { Metadata, Viewport } from 'next';
import { Instrument_Serif } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { ThemeProvider } from '@/lib/theme-context';
import { LocaleProvider } from '@/lib/i18n';
import { ServiceWorkerRegister } from '@/components/common/ServiceWorkerRegister';

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-display',
});

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
    // Brand PNG icons match foodypos so the home-screen icon looks
    // identical across the Foody product family. iOS specifically wants
    // PNG for apple-touch-icon — SVG is allowed in newer Safari but
    // unreliable. The 192px asset is what iOS uses for the home screen.
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#ea580c',
  // Allow user pinch-zoom (accessibility); the iOS focus-zoom is handled by
  // forcing inputs to 16px on mobile (see globals.css).
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (!localStorage.getItem('foody_admin_redesign_v2')) {
                  localStorage.removeItem('foody_admin_theme');
                  localStorage.setItem('foody_admin_redesign_v2', '1');
                }
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
