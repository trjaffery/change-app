'use client';

/**
 * iOS-style pill toggle. Extracted from NotificationPrefsCard so every
 * settings surface uses the same control. Also honors `accent` so grouped
 * toggles inside a section pick up its identity color when on.
 */
export default function Toggle({
  on,
  onChange,
  accent = 'home',
  disabled,
  ariaLabel = 'Toggle',
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  accent?: 'home' | 'diary' | 'gym' | 'recovery' | 'finance' | 'coach';
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const activeColor = `var(--accent-${accent})`;
  const activeGlow  = `var(--accent-${accent}-glow)`;
  return (
    <button
      type="button"
      className={`toggle${on ? ' toggle-on' : ''}`}
      onClick={() => !disabled && onChange(!on)}
      aria-pressed={on}
      aria-label={ariaLabel}
      disabled={disabled}
      style={on ? { background: activeColor, boxShadow: `0 0 12px ${activeGlow}` } : undefined}
    />
  );
}
