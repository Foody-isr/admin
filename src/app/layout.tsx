import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/lib/theme-context';
import { LocaleProvider } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Foody Admin',
  description: 'Restaurant management portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
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
        <ThemeProvider>
          <LocaleProvider>{children}</LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
