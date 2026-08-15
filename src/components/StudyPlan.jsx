import { useState } from 'react';
import { createStudyPlan, friendlyError } from '../lib/api.js';

export default function StudyPlan({ courseId, hasDocuments }) {
  const [minutes, setMinutes] = useState(180);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    if (!courseId || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await createStudyPlan({ courseId, availableMinutes: Number(minutes) });
      setPlan(result.plan);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Last-minute plan</p>
          <h2>How much time do you have?</h2>
        </div>
      </header>

      <div className="plan-controls">
        <label>
          <span>{minutes} minutes</span>
          <input
            type="number"
            min="15"
            max="720"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
        </label>
        <button type="button" className="primary" disabled={!hasDocuments || busy} onClick={generate}>
          {busy ? 'Building…' : '🔥 Create My Study Plan'}
        </button>
      </div>

      {error && <p className="banner error">{error}</p>}

      {plan && (
        <div className="plan-result">
          <h3>{plan.headline}</h3>
          <ol className="plan-blocks">
            {(plan.blocks || []).map((block, index) => (
              <li key={`${block.title}-${index}`}>
                <div className="time">{block.minutes} min</div>
                <div>
                  <h4>{block.title}</h4>
                  <p>{block.why}</p>
                  <ul>
                    {(block.actions || []).map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
          {plan.disclaimer && <p className="disclaimer">{plan.disclaimer}</p>}
        </div>
      )}
    </section>
  );
}
