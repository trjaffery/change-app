'use client';
import React from 'react';

/**
 * Two primitives for loading states:
 *   - <Skeleton />    : a single shimmer block
 *   - <SkeletonCard>  : a card-shaped placeholder you compose Skeletons into
 *
 * Animation is a CSS shimmer (background-position sweep) — cheap on the GPU.
 */

interface SkeletonProps {
  w?: number | string;
  h?: number | string;
  radius?: number | string;
  style?: React.CSSProperties;
}

export function Skeleton({ w = '100%', h = 14, radius = 6, style }: SkeletonProps) {
  return (
    <span
      className="sk-block"
      style={{
        display: 'block',
        width: w,
        height: h,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

export function SkeletonCard({ children, height, style }: { children?: React.ReactNode; height?: number; style?: React.CSSProperties }) {
  return (
    <div className="card" style={{ marginBottom: 22, minHeight: height, ...style }}>
      <style>{`
        .sk-block {
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0.04) 0%,
            rgba(255,255,255,0.08) 50%,
            rgba(255,255,255,0.04) 100%
          );
          background-size: 200% 100%;
          animation: sk-shimmer 1.6s linear infinite;
        }
        @keyframes sk-shimmer {
          0%   { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sk-block { animation: none; }
        }
      `}</style>
      {children}
    </div>
  );
}
