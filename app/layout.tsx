import type { Metadata, Viewport } from 'next';
import { Hanken_Grotesk, IBM_Plex_Mono, Instrument_Serif } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/layout/Sidebar';
import PageShell from '@/components/layout/PageShell';
import { ToastProvider } from '@/components/layout/Toast';

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const plex = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
});

const instrument = Instrument_Serif({
  subsets: ['latin'],
  display: 'swap',
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-serif',
});

export const metadata: Metadata = {
  title: 'Change',
  description: 'A quiet place to keep promises to yourself.',
  appleWebApp: {
    capable: true,
    title: 'Change',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#050506',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${hanken.variable} ${plex.variable} ${instrument.variable}`}>
      <body suppressHydrationWarning>
        <ToastProvider>
          <div className="grain" aria-hidden />
          <Sidebar />
          <main className="main-content">
            <PageShell>{children}</PageShell>
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}
