'use client';
import { useEffect, useRef, useState } from 'react';
import type { SectionAccent } from './SectionHeader';

/**
 * iOS-style large-title header.
 *
 * Behavior:
 *   • The large serif italic title renders inline at the top of the page.
 *   • A slim sticky bar (hidden by default) fades in when the user scrolls
 *     the large title out of view. Powered by IntersectionObserver on a
 *     sentinel element — no scroll listener, no layout thrash.
 *   • The sticky bar picks up the section's accent color as a hairline
 *     underline so the current page reads at a glance.
 *
 * Placement: use once per page, at the very top of the page's JSX.
 */
export default function PageHeader({
  title,
  accent = 'neutral',
  eyebrow,
  trailing,
}: {
  title: string;
  accent?: SectionAccent;
  eyebrow?: string;
  trailing?: React.ReactNode;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    // Default rootMargin — the sentinel sits at the bottom of the large-title
    // wrap. While it's inside the viewport the large title is (at least
    // partially) still visible, so the sticky bar stays hidden. Once the
    // sentinel scrolls above the viewport top, `isIntersecting` flips false
    // and the sticky bar fades in. Prior rootMargin of `0px 0px -100% 0px`
    // was wrong — it shrank the root to a top sliver and made the sentinel
    // read as not-intersecting on page load, so the sticky showed even
    // before any scroll.
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) setCollapsed(!e.isIntersecting);
      },
      { threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  const underline = accent === 'neutral' ? 'transparent' : `var(--accent-${accent})`;
  const glow      = accent === 'neutral' ? 'transparent' : `var(--accent-${accent}-glow)`;

  return (
    <header className="ph" style={{ ['--ph-underline' as string]: underline, ['--ph-glow' as string]: glow }}>
      {/* Fixed sticky compact bar. Hidden until the sentinel exits view. */}
      <div className={`ph-sticky${collapsed ? ' ph-sticky-visible' : ''}`}>
        <div className="ph-sticky-inner">
          <span className="ph-sticky-title">{title}</span>
          {trailing && <span className="ph-sticky-trailing">{trailing}</span>}
        </div>
        <div className="ph-sticky-underline" aria-hidden />
      </div>

      {/* Large in-flow title */}
      <div className="ph-large-wrap">
        {eyebrow && <div className="ph-eyebrow">{eyebrow}</div>}
        <h1 className="ph-large">{title}</h1>
      </div>

      {/* Sentinel — placed just below the large title. IO watches this. */}
      <div ref={sentinelRef} className="ph-sentinel" aria-hidden />
    </header>
  );
}
