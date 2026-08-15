import { useEffect, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import FileUploader from './components/FileUploader.jsx';
import Chat from './components/Chat.jsx';
import StudyPlan from './components/StudyPlan.jsx';
import Quiz from './components/Quiz.jsx';
import EvalPanel from './components/EvalPanel.jsx';
import { createCourse, friendlyError, ingestFile, loadCourse } from './lib/api.js';

const COURSE_KEY = 'examcram.courseId';

export default function App() {
  const [view, setView] = useState('chat');
  const [course, setCourse] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [showUploader, setShowUploader] = useState(true);
  const [explainSimply, setExplainSimply] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [booting, setBooting] = useState(true);

  const hasDocuments = documents.length > 0;

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const existingId = localStorage.getItem(COURSE_KEY);
        if (existingId) {
          try {
            const loaded = await loadCourse(existingId);
            if (cancelled) return;
            setCourse(loaded.course);
            setDocuments(loaded.documents || []);
            setShowUploader(!(loaded.documents || []).length);
            setBooting(false);
            return;
          } catch {
            localStorage.removeItem(COURSE_KEY);
          }
        }

        const created = await createCourse('My Course');
        if (cancelled) return;
        localStorage.setItem(COURSE_KEY, created.course.id);
        setCourse(created.course);
        setDocuments([]);
      } catch (err) {
        if (!cancelled) setError(friendlyError(err));
      } finally {
        if (!cancelled) setBooting(false);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const materials = useMemo(
    () => documents.filter((doc) => doc.document_type === 'course_material'),
    [documents]
  );

  async function handleUpload(files, documentType) {
    if (!course?.id) return;
    setError('');
    for (const file of files) {
      const name = file.name.toLowerCase();
      if (!name.endsWith('.pdf') && !name.endsWith('.pptx')) {
        setError("This file type isn't supported. Please upload PDF or PPTX.");
        continue;
      }
      setStatus(`Indexing ${file.name}…`);
      try {
        const result = await ingestFile({
          courseId: course.id,
          file,
          documentType,
        });
        setDocuments((current) => [...current, result.document]);
        setStatus(`Indexed ${result.filename} · ${result.chunks} chunks`);
        setShowUploader(false);
        setView('chat');
      } catch (err) {
        setError(friendlyError(err));
        setStatus('');
      }
    }
  }

  function resetCourse() {
    localStorage.removeItem(COURSE_KEY);
    window.location.reload();
  }

  if (booting) {
    return (
      <div className="boot">
        <p>Opening ExamCram…</p>
      </div>
    );
  }

  return (
    <div className="shell">
      <Sidebar
        view={view}
        onView={setView}
        documents={documents}
        onOpenUpload={() => {
          setShowUploader(true);
          setView('chat');
        }}
      />

      <main className="main">
        <header className="hero">
          <p className="kicker">Your exam is tomorrow.</p>
          <h1>Let’s make the next few hours count.</h1>
        </header>

        {(showUploader || !hasDocuments) && (
          <FileUploader onUpload={handleUpload} busy={Boolean(status.startsWith('Indexing'))} />
        )}

        {status && <p className="banner ok">{status}</p>}
        {error && <p className="banner error">{error}</p>}

        {hasDocuments && (
          <section className="material-strip">
            <p className="nav-label">COURSE MATERIAL</p>
            <ul>
              {documents.map((doc) => (
                <li key={doc.id}>
                  ✓ {doc.filename}
                  <em>{doc.document_type === 'past_exam' ? 'Past exam' : 'Lecture'}</em>
                </li>
              ))}
            </ul>
          </section>
        )}

        {view === 'chat' && (
          <Chat
            courseId={course?.id}
            hasDocuments={hasDocuments}
            explainSimply={explainSimply}
            onToggleEli5={() => setExplainSimply((value) => !value)}
          />
        )}
        {view === 'study' && <StudyPlan courseId={course?.id} hasDocuments={hasDocuments} />}
        {view === 'quiz' && <Quiz courseId={course?.id} hasDocuments={hasDocuments} />}
        {view === 'eval' && <EvalPanel courseId={course?.id} hasDocuments={hasDocuments} />}
        {view === 'settings' && (
          <section className="panel">
            <header className="panel-head">
              <div>
                <p className="eyebrow">Settings</p>
                <h2>This demo is not unlimited free AI</h2>
              </div>
            </header>
            <ul className="settings-list">
              <li>
                <strong>Course ID</strong>
                <code>{course?.id}</code>
              </li>
              <li>
                <strong>Files indexed</strong>
                <span>
                  {materials.length} lectures · {documents.length - materials.length} past exams
                </span>
              </li>
              <li>
                <strong>LLM</strong>
                <span>Gemini free tier via server adapter. No paid API is required.</span>
              </li>
              <li>
                <strong>Limits</strong>
                <span>
                  Free Gemini and embedding quotas can run out. When that happens you will see “AI
                  usage limit reached.”
                </span>
              </li>
            </ul>
            <button type="button" className="danger" onClick={resetCourse}>
              Start a new course
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
