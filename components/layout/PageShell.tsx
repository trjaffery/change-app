'use client';
import { usePathname } from 'next/navigation';

/**
 * Wraps the page content so that each route change remounts it.
 * Combined with the `.main-inner > *` stagger animation in globals.css,
 * this gives a smooth fade-and-rise transition between pages without
 * any extra animation libraries.
 */
export default function PageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="main-inner">
      {children}
    </div>
  );
}
