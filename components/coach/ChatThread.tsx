'use client';
import { useEffect, useRef, useState } from 'react';
import Markdown from '@/components/coach/Markdown';
import { useToast } from '@/components/layout/Toast';

interface ChatMessage { role: 'user' | 'assistant'; content: string }

const STORAGE_KEY = 'coach_messages';
const EXAMPLE_PROMPTS = [
  'Why was last week hard?',
  'What should I focus on this Saturday?',
  'Plan me a deload week given my recent lifts.',
  "I'm tempted right now — what should I do?",
  'How does my net worth tie to my habits?',
];

export default function ChatThread() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // Live-updating assistant reply during streaming; appended to messages when done.
  const [streamingReply, setStreamingReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const toast = useToast();

  // Load from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw) as ChatMessage[]);
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  // Persist whenever messages change (after hydration so we don't wipe on first render).
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch { /* storage full */ }
  }, [messages, hydrated]);

  // Auto-scroll to bottom on new messages or streaming updates.
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, sending, streamingReply]);

  // If the user navigates away mid-stream, cancel the in-flight request.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);
    const next: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setDraft('');
    setSending(true);
    setStreamingReply('');

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || `HTTP ${res.status}`);
      }
      // Read the plain-text stream chunk by chunk, accumulating into local + state.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setStreamingReply(acc);
      }
      if (acc) {
        setMessages(prev => [...prev, { role: 'assistant', content: acc }]);
      }
      setStreamingReply('');
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        // User stopped the stream — keep whatever was already streamed as a partial reply.
        setStreamingReply(prev => {
          if (prev) setMessages(p => [...p, { role: 'assistant', content: prev + '\n\n*(stopped)*' }]);
          return '';
        });
      } else {
        setError(e instanceof Error ? e.message : 'Network error');
        setStreamingReply('');
      }
    } finally {
      setSending(false);
      abortRef.current = null;
      taRef.current?.focus();
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function clearAll() {
    if (messages.length === 0) return;
    const snapshot = messages;
    setMessages([]);
    setError(null);
    toast({
      kind: 'warning',
      message: 'Conversation cleared',
      undo: () => setMessages(snapshot),
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  }

  return (
    <>
      <style>{`
        /* Chat fills the available viewport space:
           - Desktop: subtract the page title (~80px) and a small bottom margin.
           - Mobile: also subtract the bottom tab nav + the iPhone home-indicator
             safe area so the input bar lands above them, not behind. */
        .chat-wrap {
          display: flex; flex-direction: column;
          height: calc(100dvh - 120px);
          max-height: 900px;
        }
        @media (max-width: 640px) {
          .chat-wrap {
            height: calc(100dvh - 110px - var(--nav-h) - env(safe-area-inset-top) - env(safe-area-inset-bottom));
          }
        }
        /* Floating Clear button — anchored top-right of the chat area, not a row. */
        .chat-clear {
          position: absolute; top: 0; right: 0;
          background: transparent; border: 1px solid rgba(255,255,255,0.08);
          color: var(--text-tertiary); font-size: 11px; padding: 5px 11px;
          border-radius: 7px; cursor: pointer; font-family: var(--font-mono);
          transition: color 0.15s, background 0.15s;
          z-index: 2;
          -webkit-tap-highlight-color: transparent;
        }
        .chat-clear:hover { color: var(--text-secondary); background: rgba(255,255,255,0.04); }
        .chat-wrap { position: relative; }
        .chat-list {
          flex: 1; overflow-y: auto; padding-right: 4px;
          display: flex; flex-direction: column; gap: 14px;
        }
        .chat-bubble { max-width: 78%; padding: 10px 14px; border-radius: 14px; font-size: 14px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
        .chat-bubble-user { align-self: flex-end; background: rgba(107,227,164,0.07); border: 1px solid rgba(107,227,164,0.15); color: var(--text-primary); border-bottom-right-radius: 6px; }
        .chat-bubble-asst { align-self: flex-start; background: transparent; color: var(--text-secondary); border-bottom-left-radius: 6px; padding-left: 4px; padding-right: 4px; max-width: 88%; }
        .chat-label { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--success); opacity: 0.7; margin-bottom: 4px; }
        .chat-skeleton { display: flex; gap: 4px; padding: 10px 4px; }
        .chat-skeleton span { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.3); animation: chatBlink 1.2s infinite ease-in-out; }
        .chat-skeleton span:nth-child(2) { animation-delay: 0.18s; }
        .chat-skeleton span:nth-child(3) { animation-delay: 0.36s; }
        @keyframes chatBlink { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); } 40% { opacity: 1; transform: scale(1); } }
        .chat-empty {
          flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 14px; text-align: center; color: var(--text-tertiary); padding: 18px 8px;
        }
        .chat-empty-heading { font-size: 14px; color: var(--text-secondary); max-width: 360px; line-height: 1.55; }
        .chat-examples { display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 480px; }
        .chat-example {
          padding: 10px 14px; border-radius: 10px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);
          font-size: 13px; color: var(--text-secondary); text-align: left;
          cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s;
          font-family: var(--font-sans);
        }
        .chat-example:hover { background: rgba(107,227,164,0.06); border-color: rgba(107,227,164,0.18); color: var(--text-primary); }
        .chat-input-bar {
          display: flex; gap: 8px; align-items: flex-end;
          padding-top: 14px; margin-top: 6px;
          border-top: 1px solid rgba(255,255,255,0.05);
        }
        .chat-textarea {
          flex: 1; background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 12px;
          padding: 11px 14px; color: var(--text-primary); font-size: 14px;
          font-family: var(--font-sans); resize: none; min-height: 44px; max-height: 160px;
          line-height: 1.45; outline: none; transition: border-color 0.15s;
        }
        .chat-textarea:focus { border-color: rgba(107,227,164,0.35); }
        .chat-send {
          background: rgba(107,227,164,0.12); border: 1px solid rgba(107,227,164,0.35);
          color: var(--success); font-weight: 700; font-size: 13px;
          padding: 11px 18px; border-radius: 12px; cursor: pointer;
          font-family: var(--font-sans); transition: background 0.15s, opacity 0.15s;
          min-height: 44px;
        }
        .chat-send:hover:not(:disabled) { background: rgba(107,227,164,0.2); }
        .chat-send:disabled { opacity: 0.4; cursor: default; }
        .chat-send.chat-stop {
          background: rgba(242,192,99,0.12);
          border-color: rgba(242,192,99,0.4);
          color: var(--warning);
        }
        .chat-send.chat-stop:hover { background: rgba(242,192,99,0.2); }
        .chat-error { font-size: 12px; color: var(--danger); padding: 6px 0; }
      `}</style>

      <div className="chat-wrap">
        {messages.length > 0 && (
          <button className="chat-clear" onClick={clearAll}>Clear</button>
        )}
        <div className="chat-list" ref={listRef}>
          {messages.length === 0 ? (
            <div className="chat-empty">
              <div className="chat-empty-heading">
                Ask anything — I see your habits, recovery, gym, finance, and the patterns across them. The more specific you are, the more useful I can be.
              </div>
              <div className="chat-examples">
                {EXAMPLE_PROMPTS.map(p => (
                  <button key={p} className="chat-example" onClick={() => { setDraft(p); taRef.current?.focus(); }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-asst'}`}>
                {m.role === 'assistant' && <div className="chat-label">Coach</div>}
                {m.role === 'assistant'
                  ? <Markdown text={m.content} />
                  : m.content}
              </div>
            ))
          )}
          {sending && (
            <div className="chat-bubble chat-bubble-asst">
              <div className="chat-label">Coach</div>
              {streamingReply
                ? <Markdown text={streamingReply} />
                : <div className="chat-skeleton"><span /><span /><span /></div>}
            </div>
          )}
          {error && <div className="chat-error">Error: {error}</div>}
        </div>

        <div className="chat-input-bar">
          <textarea
            ref={taRef}
            className="chat-textarea"
            placeholder="Ask your coach…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={sending}
            rows={1}
            autoCapitalize="sentences"
            autoCorrect="on"
          />
          {sending ? (
            <button className="chat-send chat-stop" onClick={stop}>
              Stop
            </button>
          ) : (
            <button
              className="chat-send"
              onClick={() => send(draft)}
              disabled={!draft.trim()}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </>
  );
}
