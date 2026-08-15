export function formatSource(source) {
  if (!source) return '';
  if (source.slide != null) return `${source.document} — Slide ${source.slide}`;
  if (source.page != null) return `${source.document} — Page ${source.page}`;
  return source.document;
}

export default function Sources({ sources }) {
  if (!sources?.length) return null;

  return (
    <div className="sources">
      <p className="sources-label">Sources</p>
      <ul>
        {sources.map((source, index) => (
          <li key={`${source.document}-${source.page}-${source.slide}-${index}`}>
            <span aria-hidden="true">📎</span>
            <span>{formatSource(source)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
