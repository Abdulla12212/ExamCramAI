import { useEffect, useRef, useState } from 'react';
import Sources from './Sources.jsx';
import { friendlyError, sendChat } from '../lib/api.js';

const SUGGESTIONS = [
  'Explain the main idea of this course.',
  'What should I study first?',
  'Quiz me on the key definitions.',
];

export default function Chat({ courseId, hasDocuments, explainSimply, onToggleEli5 }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  async function ask(text) {
    const message = String(text || '').trim();
    if (!message || busy || !courseId) return;
    setError('');
    setDraft('');
    setMessages((current) => [...current, { role: 'student', text: message }]);
    setBusy(true);
    try {
      const result = await sendChat({ courseId, message, explainSimply });
      setMessages((current) => [
        ...current,
        { role: 'examcram', text: result.answer, sources: result.sources || [] },
      ]);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel chat-panel">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Ask Course</p>
          <h2>Questions, grounded in your files</h2>
        </div>
        <button
          type="button"
          className={`eli5 ${explainSimply ? 'on' : ''}`}
          onClick={onToggleEli5}
        >
          🧒 Explain simply
        </button>
      </header>

      <div className="transcript">
        {!messages.length && (
          <div className="empty-chat">
            <p>Ask anything from the uploaded lectures.</p>
            <div className="chips">
              {SUGGESTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  disabled={!hasDocuments || busy}
                  onClick={() => ask(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={`bubble ${message.role}`}>
            <p className="who">{message.role === 'student' ? 'Student' : 'ExamCram'}</p>
            <p className="copy">{message.text}</p>
            {message.role === 'examcram' && <Sources sources={message.sources} />}
          </article>
        ))}

        {busy && <p className="thinking">Searching your notes…</p>}
        <div ref={endRef} />
      </div>

      {error && <p className="banner error">{error}</p>}

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          ask(draft);
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={hasDocuments ? 'Ask about your course…' : 'Upload lectures first'}
          disabled={!hasDocuments || busy}
        />
        <button type="submit" disabled={!hasDocuments || busy || !draft.trim()}>
          Ask
        </button>
      </form>
    </section>
  );
}
