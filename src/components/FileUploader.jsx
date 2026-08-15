import { useState } from 'react';

const ACCEPT = '.pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation';

export default function FileUploader({ onUpload, busy }) {
  const [documentType, setDocumentType] = useState('course_material');
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || busy) return;
    onUpload(files, documentType);
  }

  return (
    <section className="uploader">
      <div className="type-toggle" role="group" aria-label="Upload type">
        <button
          type="button"
          className={documentType === 'course_material' ? 'active' : ''}
          onClick={() => setDocumentType('course_material')}
        >
          📚 Course Material
        </button>
        <button
          type="button"
          className={documentType === 'past_exam' ? 'active' : ''}
          onClick={() => setDocumentType('past_exam')}
        >
          📝 Past Exam
        </button>
      </div>

      <label
        className={`dropzone ${dragOver ? 'dragover' : ''} ${busy ? 'disabled' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        <input
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          disabled={busy}
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <strong>{busy ? 'Indexing…' : 'Upload lectures'}</strong>
        <span>PDF or PPTX · up to 4.5 MB each</span>
      </label>
    </section>
  );
}
