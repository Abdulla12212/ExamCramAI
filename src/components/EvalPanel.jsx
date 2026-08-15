import { useState } from 'react';
import Sources, { formatSource } from './Sources.jsx';
import { EVAL_QUESTIONS } from '../lib/evalQuestions.js';
import { friendlyError, retrieveDebug } from '../lib/api.js';

export default function EvalPanel({ courseId, hasDocuments }) {
  const [selectedId, setSelectedId] = useState(EVAL_QUESTIONS[0].id);
  const [custom, setCustom] = useState('');
  const [includeAnswer, setIncludeAnswer] = useState(true);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [marks, setMarks] = useState({});

  const selected = EVAL_QUESTIONS.find((item) => item.id === selectedId);
  const question = custom.trim() || selected?.question || '';

  async function run() {
    if (!courseId || busy || !question) return;
    setBusy(true);
    setError('');
    try {
      const payload = await retrieveDebug({
        courseId,
        question,
        includeAnswer,
      });
      setResult(payload);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  function mark(key, value) {
    setMarks((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="panel eval-panel">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Internal evaluation</p>
          <h2>Inspect retrieval before trusting the answer</h2>
        </div>
      </header>

      <p className="muted eval-note">
        This screen is for RAG quality, not students. Check whether the right page or slide lands in
        the top 5, whether the answer stays inside those chunks, and whether the model refuses
        unsupported questions.
      </p>

      <div className="eval-grid">
        <div>
          <p className="nav-label">10 test questions</p>
          <div className="eval-questions">
            {EVAL_QUESTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === selectedId ? 'active' : ''}
                onClick={() => {
                  setSelectedId(item.id);
                  setCustom('');
                }}
              >
                <strong>{item.label}</strong>
                <span>{item.question}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="field">
            Question
            <textarea
              rows={4}
              value={custom || selected?.question || ''}
              onChange={(event) => setCustom(event.target.value)}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={includeAnswer}
              onChange={(event) => setIncludeAnswer(event.target.checked)}
            />
            Generate answer after retrieval
          </label>
          <button type="button" className="primary" disabled={!hasDocuments || busy} onClick={run}>
            {busy ? 'Retrieving…' : includeAnswer ? 'Retrieve + answer' : 'Retrieve only'}
          </button>
        </div>
      </div>

      {error && <p className="banner error">{error}</p>}

      {result && (
        <div className="eval-result">
          <h3>Question</h3>
          <p>{result.question}</p>

          <h3>Retrieved chunks</h3>
          <ol className="retrieved">
            {(result.retrieved || []).map((chunk) => (
              <li key={chunk.id}>
                <div className="retrieved-head">
                  <strong>
                    {chunk.rank}. {formatSource(chunk)}
                  </strong>
                  <span>similarity {chunk.similarity.toFixed(2)}</span>
                </div>
                <p>{chunk.snippet}</p>
              </li>
            ))}
          </ol>

          {includeAnswer && (
            <>
              <h3>Generated answer</h3>
              <p className="copy">{result.answer}</p>
              <Sources sources={result.sources} />
            </>
          )}

          <h3>Score this run</h3>
          <div className="score-grid">
            {[
              ['retrieval', 'Retrieval: correct slide/page in top 5?'],
              ['grounding', 'Grounding: answer used retrieved material?'],
              ['citations', 'Citations: displayed sources actually contain the answer?'],
              ['refusal', 'Refusal: model declined unsupported questions?'],
            ].map(([key, label]) => (
              <div key={key} className="score-row">
                <span>{label}</span>
                <div>
                  <button type="button" className={marks[key] === 'yes' ? 'on' : ''} onClick={() => mark(key, 'yes')}>
                    Yes
                  </button>
                  <button type="button" className={marks[key] === 'no' ? 'on' : ''} onClick={() => mark(key, 'no')}>
                    No
                  </button>
                  <button type="button" className={marks[key] === 'na' ? 'on' : ''} onClick={() => mark(key, 'na')}>
                    N/A
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
