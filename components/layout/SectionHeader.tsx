'use client';
import React from 'react';

export type SectionAccent = 'home' | 'diary' | 'gym' | 'recovery' | 'finance' | 'coach' | 'neutral';

/**
 * Section header used to introduce a block of content inside a card or a
 * page. Replaces the ad-hoc `<div className="section-title">` pattern. Small
 * leading pip picks up the section accent color when specified.
 *
 * Slots: `trailing` (an inline count, button, chevron, etc.)
 */
export default function SectionHeader({
  children,
  accent,
  trailing,
  className,
}: {
  children: React.ReactNode;
  accent?: SectionAccent;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const pipColor = accent && accent !== 'neutral' ? `var(--accent-${accent})` : 'var(--text-tertiary)';
  const pipGlow  = accent && accent !== 'neutral' ? `var(--accent-${accent}-glow)` : 'transparent';
  return (
    <div className={`sh${className ? ' ' + className : ''}`}>
      <span className="sh-pip" style={{ background: pipColor, boxShadow: `0 0 10px ${pipGlow}` }} aria-hidden />
      <span className="sh-label">{children}</span>
      <span className="sh-line" aria-hidden />
      {trailing && <span className="sh-trailing">{trailing}</span>}
    </div>
  );
}
