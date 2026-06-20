import { ImageResponse } from 'next/og';

// iOS uses this for the home-screen icon when the user "Adds to Home Screen."
// 180x180 PNG is the canonical size that iOS won't downscale further.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#050506',
          color: '#6BE3A4',
          fontSize: 118,
          fontStyle: 'italic',
          fontWeight: 400,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'serif',
          letterSpacing: '-0.04em',
        }}
      >
        C
      </div>
    ),
    { ...size },
  );
}
