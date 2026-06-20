import { ImageResponse } from 'next/og';

// iOS uses this for the home-screen icon when the user "Adds to Home Screen."
// 180x180 PNG is the canonical size that iOS won't downscale further.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/**
 * Icon design:
 *   • Background: subtle linear gradient from teal-tinted black down to pure
 *     black so the icon doesn't read as a flat square on the home screen.
 *   • Soft green halo (radial gradient overlay) gives the central glyph
 *     the same "alive" feel as the dashboard CompletionRing's glow.
 *   • A thin green stroke ring nods at the completion-ring motif central to
 *     the app's visual language.
 *   • Italic serif "C" — matches the brand mark in the sidebar.
 *
 * Satori (the renderer behind ImageResponse) supports flexbox + gradients
 * but not text-shadow or box-shadow filters — so depth comes from layered
 * radial gradients rather than CSS shadows.
 */
function Icon({ scale = 1 }: { scale?: number }) {
  const ringSize = 132 * scale;
  const ringBorder = 2 * scale;
  const haloSize = 140 * scale;
  const letterSize = 112 * scale;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        background: 'linear-gradient(135deg, #0E1A14 0%, #060709 65%, #030305 100%)',
      }}
    >
      {/* Soft green halo behind the glyph — radial fade for organic depth. */}
      <div
        style={{
          position: 'absolute',
          width: haloSize, height: haloSize,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(107,227,164,0.32) 0%, rgba(107,227,164,0.12) 38%, rgba(107,227,164,0) 70%)',
          display: 'flex',
        }}
      />
      {/* Thin completion-ring inspired stroke. */}
      <div
        style={{
          position: 'absolute',
          width: ringSize, height: ringSize,
          borderRadius: '50%',
          border: `${ringBorder}px solid rgba(107,227,164,0.55)`,
          display: 'flex',
        }}
      />
      {/* Brand glyph — italic serif C, same as the sidebar mark. */}
      <div
        style={{
          fontSize: letterSize,
          fontFamily: 'serif',
          fontStyle: 'italic',
          fontWeight: 400,
          color: '#7FECB1',
          letterSpacing: '-0.04em',
          lineHeight: 1,
          // Nudge the optical center of an italic C down-and-left a hair.
          transform: `translate(${-2 * scale}px, ${-4 * scale}px)`,
          display: 'flex',
        }}
      >
        C
      </div>
    </div>
  );
}

export default function AppleIcon() {
  return new ImageResponse((<Icon scale={1} />), { ...size });
}
