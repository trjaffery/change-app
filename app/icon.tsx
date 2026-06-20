import { ImageResponse } from 'next/og';

export const size = { width: 256, height: 256 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#050506',
          color: '#6BE3A4',
          fontSize: 168,
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
