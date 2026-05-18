import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/layout/Sidebar';

export const metadata: Metadata = {
  title: 'Change',
  description: 'Personal dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: '100%' }}>
      <body>
        <div className="grain" />
        <Sidebar />
        <main style={{
          marginLeft: 60,
          maxWidth: 1100,
          padding: '32px 24px 80px',
          position: 'relative',
          zIndex: 2,
        }}>
          {children}
        </main>
      </body>
    </html>
  );
}
