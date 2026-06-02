'use client';
import React from 'react';

/**
 * Reusable empty-state surface. Used wherever a list is empty but the user
 * benefits from an explicit nudge (CTA) or context (description).
 *
 * Visual: glyph + title + optional description + optional CTA, centered.
 */

export interface EmptyStateProps {
  glyph?: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  compact?: boolean;     // Smaller padding when the host card is tight
}

export default function EmptyState({ glyph = '◌', title, description, action, compact }: EmptyStateProps) {
  return (
    <div
      className="empty-state-card"
      style={{
        padding: compact ? '18px 12px' : '28px 16px',
      }}
    >
      <style>{`
        .empty-state-card {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center;
          gap: 8px;
          color: var(--text-tertiary);
        }
        .empty-glyph {
          font-family: var(--font-mono);
          font-size: 28px;
          color: var(--text-tertiary);
          opacity: 0.7;
          margin-bottom: 4px;
          line-height: 1;
        }
        .empty-title {
          font-size: 14px; font-weight: 600; color: var(--text-secondary);
          letter-spacing: -0.005em;
        }
        .empty-desc {
          font-size: 12px; color: var(--text-tertiary);
          max-width: 280px; line-height: 1.55;
        }
        .empty-action {
          margin-top: 8px;
          padding: 8px 16px;
          border-radius: 10px;
          border: 1px solid rgba(107,227,164,0.32);
          background: rgba(107,227,164,0.08);
          color: var(--success);
          font-family: var(--font-sans); font-size: 12px; font-weight: 600;
          letter-spacing: -0.005em;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          transition: background 180ms ease;
          min-height: 36px;
        }
        .empty-action:hover { background: rgba(107,227,164,0.14); }
        .empty-action:active { transform: scale(0.98); }
      `}</style>
      <div className="empty-glyph" aria-hidden>{glyph}</div>
      <div className="empty-title">{title}</div>
      {description && <div className="empty-desc">{description}</div>}
      {action && (
        <button className="empty-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
