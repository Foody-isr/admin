import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Foody Admin',
  description: 'Restaurant management portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
