import React, { useState, useRef, useEffect } from 'react';
import { answerQuestion } from '../assistant.js';

const QUICK_REPLIES = [
  'How can I cut costs?',
  'Where did my money go this month?',
  'How do I add a recurring transaction?',
];

const CHAT_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export default function Assistant({ transactions, budgets }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: "Hi! I'm your money helper. Ask me where your money is going, how to cut costs, or how anything in the app works.",
    },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, thinking, open]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const send = (raw) => {
    const text = (raw || '').trim();
    if (text === '' || thinking) return;
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setThinking(true);
    timerRef.current = setTimeout(() => {
      const reply = answerQuestion(text, { transactions, budgets });
      setMessages((m) => [...m, { role: 'assistant', text: reply }]);
      setThinking(false);
    }, 600);
  };

  const onSubmit = (e) => {
    e.preventDefault();
    send(input);
  };

  return (
    <>
      <button
        className="assistant-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        title="Ask the money helper"
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          CHAT_ICON
        )}
      </button>

      {open && (
        <div className="assistant-panel glass-card" role="dialog" aria-label="Money helper chat">
          <div className="assistant-header">
            <strong>Money Helper</strong>
            <span className="assistant-sub">Private — runs on your data only</span>
          </div>
          <div className="assistant-messages">
            {messages.map((m, idx) => (
              <div key={idx} className={`assistant-msg assistant-${m.role}`}>
                {m.text}
              </div>
            ))}
            {thinking && (
              <div className="assistant-msg assistant-assistant assistant-thinking" aria-label="Thinking">
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <span className="thinking-dot" />
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="assistant-chips">
            {QUICK_REPLIES.map((q) => (
              <button key={q} className="assistant-chip" onClick={() => send(q)} disabled={thinking}>
                {q}
              </button>
            ))}
          </div>
          <form className="assistant-input-row" onSubmit={onSubmit}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your money…"
              maxLength={300}
              aria-label="Ask the money helper"
            />
            <button type="submit" className="btn btn-primary" disabled={thinking || input.trim() === ''}>
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
