import type { Metadata, Viewport } from 'next';
import { Hanken_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/layout/Sidebar';
import SettingsButton from '@/components/layout/SettingsButton';
import PageShell from '@/components/layout/PageShell';
import { ToastProvider } from '@/components/layout/Toast';
import ServiceWorkerRegister from '@/components/pwa/ServiceWorkerRegister';

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
  // Deliberately no `maximumScale` — locking zoom is an a11y violation.
  // The 16px input font size in globals.css handles the iOS auto-zoom issue.
  viewportFit: 'cover',
  themeColor: '#050506',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${hanken.variable} ${plex.variable}`}>
      <body suppressHydrationWarning>
        <ToastProvider>
          <ServiceWorkerRegister />
          <Sidebar />
          <SettingsButton />
          <main className="main-content">
            <PageShell>{children}</PageShell>
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}
