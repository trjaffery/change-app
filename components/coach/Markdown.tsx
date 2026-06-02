'use client';
import React from 'react';

/**
 * Tiny safe-by-construction markdown renderer for the coach chat.
 *
 * Supports the subset the Gemini coach actually produces:
 *   - paragraphs (blank line between)
 *   - unordered lists (`- ` or `* `)
 *   - ordered lists (`1. `, `2. `)
 *   - inline **bold**, *italic*, `code`
 *   - line breaks inside paragraphs (single newline)
 *
 * No HTML, no dangerouslySetInnerHTML, no external dep.
 */

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] };

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) {
      blocks.push({ kind: 'p', text: para.join('\n') });
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw;
    const ulMatch = /^\s*[-*]\s+(.*)$/.exec(line);
    const olMatch = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (ulMatch) {
      flushPara();
      if (!list || list.kind !== 'ul') { flushList(); list = { kind: 'ul', items: [] }; }
      list.items.push(ulMatch[1]);
    } else if (olMatch) {
      flushPara();
      if (!list || list.kind !== 'ol') { flushList(); list = { kind: 'ol', items: [] }; }
      list.items.push(olMatch[1]);
    } else if (line.trim() === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}

// Inline formatter: handles **bold**, *italic*, `code`. Returns a React fragment
// with proper element nesting. Order of tokenization matters — match longest first.
function renderInline(text: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  // Combined regex with named alternatives. Apostrophes break `*italic*` so
  // we require word boundaries on the inside.
  const re = /\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*|`([^`\n]+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(<strong key={key++}>{m[1]}</strong>);
    } else if (m[2] !== undefined) {
      nodes.push(<em key={key++}>{m[2]}</em>);
    } else if (m[3] !== undefined) {
      nodes.push(<code key={key++} className="md-code">{m[3]}</code>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// A paragraph may include single-newline line breaks. Render them as <br />.
function renderParagraph(text: string, key: number): React.ReactNode {
  const lines = text.split('\n');
  return (
    <p key={key} className="md-p">
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {i > 0 && <br />}
          {renderInline(line)}
        </React.Fragment>
      ))}
    </p>
  );
}

export default function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <>
      <style>{`
        .md-p { margin: 0; line-height: 1.55; }
        .md-p + .md-p, .md-p + .md-list, .md-list + .md-p { margin-top: 0.7em; }
        .md-list { margin: 0.4em 0 0; padding-left: 1.25em; line-height: 1.55; }
        .md-list li { margin: 0.15em 0; }
        .md-code {
          font-family: var(--font-mono); font-size: 0.9em;
          padding: 1px 6px; border-radius: 5px;
          background: rgba(255,255,255,0.06); color: var(--text-primary);
        }
        .md-p strong { color: var(--text-primary); font-weight: 700; }
        .md-p em { font-style: italic; color: var(--text-secondary); }
      `}</style>
      {blocks.map((b, i) => {
        if (b.kind === 'p') return renderParagraph(b.text, i);
        const Tag = b.kind === 'ul' ? 'ul' : 'ol';
        return (
          <Tag key={i} className="md-list">
            {b.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
          </Tag>
        );
      })}
    </>
  );
}
