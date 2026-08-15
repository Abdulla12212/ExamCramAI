const NAV = [
  { id: 'chat', group: 'TOOLS', label: 'Ask Course', icon: '💬' },
  { id: 'study', group: 'TOOLS', label: 'Study Plan', icon: '🔥' },
  { id: 'quiz', group: 'TOOLS', label: 'Quiz', icon: '🧠' },
  { id: 'eval', group: 'TOOLS', label: 'RAG Eval', icon: '🔎' },
  { id: 'settings', group: 'SETTINGS', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar({ view, onView, documents, onOpenUpload }) {
  const materials = documents.filter((doc) => doc.document_type === 'course_material');
  const exams = documents.filter((doc) => doc.document_type === 'past_exam');

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">🎓</span>
        <div>
          <p className="brand-name">ExamCram</p>
          <p className="brand-sub">Grounded in your notes</p>
        </div>
      </div>

      <section>
        <p className="nav-label">MY COURSE</p>
        <div className="course-block">
          <p className="course-heading">📚 Materials</p>
          {materials.length ? (
            <ul className="file-list">
              {materials.map((doc) => (
                <li key={doc.id}>✓ {doc.filename}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">No lectures yet</p>
          )}

          <p className="course-heading">📝 Past Exams</p>
          {exams.length ? (
            <ul className="file-list">
              {exams.map((doc) => (
                <li key={doc.id}>✓ {doc.filename}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">None uploaded</p>
          )}

          <button type="button" className="ghost-btn" onClick={onOpenUpload}>
            + Add files
          </button>
        </div>
      </section>

      {['TOOLS', 'SETTINGS'].map((group) => (
        <section key={group}>
          <p className="nav-label">{group}</p>
          <nav>
            {NAV.filter((item) => item.group === group).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-btn ${view === item.id ? 'active' : ''}`}
                onClick={() => onView(item.id)}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </section>
      ))}
    </aside>
  );
}
