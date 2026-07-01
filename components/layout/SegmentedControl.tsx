'use client';

/**
 * iOS-style segmented control. Replaces ad-hoc `.seg-btn` sets across the
 * app. The selected segment gets a raised background and picks up the
 * caller's accent color.
 *
 * Options are provided as `{ value, label }` pairs so callers don't have
 * to fight with children/data-attributes.
 */
interface Option<T extends string> { value: T; label: React.ReactNode; disabled?: boolean }

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accent = 'home',
  size = 'md',
  ariaLabel = 'Choose one',
}: {
  options: Option<T>[];
  value: T;
  onChange: (next: T) => void;
  accent?: 'home' | 'diary' | 'gym' | 'recovery' | 'finance' | 'coach' | 'neutral';
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  const accentVar = accent === 'neutral' ? undefined : `var(--accent-${accent})`;
  return (
    <div className={`sc sc-${size}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map(o => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            className={`sc-seg${selected ? ' sc-seg-on' : ''}`}
            onClick={() => !o.disabled && onChange(o.value)}
            role="radio"
            aria-checked={selected}
            disabled={o.disabled}
            style={selected && accentVar ? { color: accentVar } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
