'use client';
import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

/**
 * Canonical list-row primitive.
 *
 * Layout:
 *   [leading]  Title                          [trailing]  [chevron]
 *              Subtitle (optional)
 *
 * Groups of rows use ListRow.Group as their container — matches the iOS
 * Settings pattern of rounded card containers with hairline dividers.
 *
 * Styles live in app/globals.css under the `.lr` / `.lr-group` prefixes so
 * the DOM stays lean and the primitive itself is just semantics.
 */

interface RowProps {
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  href?: string;                 // navigation rows
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

function RowInner({
  leading, title, subtitle, trailing, chevron, disabled,
}: Omit<RowProps, 'onClick' | 'href' | 'className' | 'ariaLabel'>) {
  return (
    <div className="lr-inner">
      {leading && <div className="lr-leading" aria-hidden>{leading}</div>}
      <div className="lr-body">
        <div className="lr-title">{title}</div>
        {subtitle && <div className="lr-sub">{subtitle}</div>}
      </div>
      {trailing && <div className="lr-trailing">{trailing}</div>}
      {chevron && !disabled && (
        <span className="lr-chev" aria-hidden>
          <ChevronRight size={16} strokeWidth={1.75} />
        </span>
      )}
    </div>
  );
}

function ListRowRoot({
  leading, title, subtitle, trailing, chevron,
  onClick, href, disabled, className, ariaLabel,
}: RowProps) {
  const inner = <RowInner leading={leading} title={title} subtitle={subtitle} trailing={trailing} chevron={chevron} disabled={disabled} />;
  const cls = `lr${disabled ? ' lr-disabled' : ''}${className ? ' ' + className : ''}`;

  if (href && !disabled) {
    return <Link href={href} className={cls} aria-label={ariaLabel}>{inner}</Link>;
  }
  if (onClick && !disabled) {
    return (
      <button type="button" className={cls} onClick={onClick} aria-label={ariaLabel} disabled={disabled}>
        {inner}
      </button>
    );
  }
  return <div className={cls} aria-label={ariaLabel}>{inner}</div>;
}

function Group({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="lr-group-wrap">
      {label && <div className="lr-group-label">{label}</div>}
      <div className="lr-group">{children}</div>
    </div>
  );
}

function Divider() {
  return <div className="lr-divider" />;
}

const ListRow = Object.assign(ListRowRoot, { Group, Divider });
export default ListRow;
