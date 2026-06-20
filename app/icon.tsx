import { ImageResponse } from 'next/og';

// PWA manifest + favicon source. 256x256 keeps it sharp anywhere it lands.
// Mirrors apple-icon.tsx — same design, scaled up.
export const size = { width: 256, height: 256 };
export const contentType = 'image/png';

export default function Icon() {
  const scale = 256 / 180;
  const ringSize = 132 * scale;
  const ringBorder = 2 * scale;
  const haloSize = 140 * scale;
  const letterSize = 112 * scale;

  return new ImageResponse(
    (
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
        <div
          style={{
            position: 'absolute',
            width: haloSize, height: haloSize,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(107,227,164,0.32) 0%, rgba(107,227,164,0.12) 38%, rgba(107,227,164,0) 70%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: ringSize, height: ringSize,
            borderRadius: '50%',
            border: `${ringBorder}px solid rgba(107,227,164,0.55)`,
            display: 'flex',
          }}
        />
        <div
          style={{
            fontSize: letterSize,
            fontFamily: 'serif',
            fontStyle: 'italic',
            fontWeight: 400,
            color: '#7FECB1',
            letterSpacing: '-0.04em',
            lineHeight: 1,
            transform: `translate(${-2 * scale}px, ${-4 * scale}px)`,
            display: 'flex',
          }}
        >
          C
        </div>
      </div>
    ),
    { ...size },
  );
}
