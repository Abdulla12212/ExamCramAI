import { useMemo, useState } from 'react';
import Sources from './Sources.jsx';
import { createQuiz, friendlyError } from '../lib/api.js';

export default function Quiz({ courseId, hasDocuments }) {
  const [count, setCount] = useState(5);
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const current = questions[index];
  const done = questions.length > 0 && answers.length === questions.length;
  const score = useMemo(
    () => answers.filter((item) => item.correct).length,
    [answers]
  );

  async function generate() {
    if (!courseId || busy) return;
    setBusy(true);
    setError('');
    setAnswers([]);
    setPicked(null);
    setIndex(0);
    try {
      const result = await createQuiz({ courseId, numberOfQuestions: Number(count) });
      setQuestions(result.questions || []);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  function lockAnswer(optionIndex) {
    if (picked != null || !current) return;
    setPicked(optionIndex);
  }

  function next() {
    if (picked == null || !current) return;
    const entry = {
      id: current.id,
      correct: picked === current.correctAnswer,
    };
    const nextAnswers = [...answers, entry];
    setAnswers(nextAnswers);
    setPicked(null);
    if (index + 1 < questions.length) setIndex(index + 1);
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Practice quiz</p>
          <h2>Questions from your own slides</h2>
        </div>
      </header>

      <div className="plan-controls">
        <label>
          <span>{count} questions</span>
          <input
            type="number"
            min="3"
            max="10"
            value={count}
            onChange={(event) => setCount(event.target.value)}
          />
        </label>
        <button type="button" className="primary" disabled={!hasDocuments || busy} onClick={generate}>
          {busy ? 'Writing questions…' : '🧠 Quiz me'}
        </button>
      </div>

      {error && <p className="banner error">{error}</p>}

      {current && !done && (
        <article className="quiz-card">
          <p className="muted">
            Question {index + 1} of {questions.length}
          </p>
          <h3>{current.question}</h3>
          <div className="options">
            {current.options.map((option, optionIndex) => {
              const revealed = picked != null;
              const isCorrect = optionIndex === current.correctAnswer;
              const isPicked = optionIndex === picked;
              let className = 'option';
              if (revealed && isCorrect) className += ' correct';
              if (revealed && isPicked && !isCorrect) className += ' wrong';
              return (
                <button
                  key={option}
                  type="button"
                  className={className}
                  onClick={() => lockAnswer(optionIndex)}
                >
                  {option}
                </button>
              );
            })}
          </div>
          {picked != null && (
            <div className="explain">
              <p>{current.explanation}</p>
              <Sources sources={current.sources} />
              <button type="button" className="primary" onClick={next}>
                {index + 1 === questions.length ? 'See score' : 'Next'}
              </button>
            </div>
          )}
        </article>
      )}

      {done && (
        <div className="score-card">
          <h3>
            {score} / {questions.length} correct
          </h3>
          <p>Re-run the quiz after another review pass.</p>
        </div>
      )}
    </section>
  );
}
