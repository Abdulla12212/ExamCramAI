const BASE = '/.netlify/functions';

async function request(path, options = {}) {
  const response = await fetch(`${BASE}/${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error || 'Request failed.');
    error.code = payload.code || `HTTP_${response.status}`;
    error.status = response.status;
    throw error;
  }

  return payload;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

export async function createCourse(name) {
  return request('course', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function loadCourse(courseId) {
  return request(`course?courseId=${encodeURIComponent(courseId)}`);
}

export async function ingestFile({ courseId, file, documentType }) {
  const contentBase64 = await fileToBase64(file);
  return request('ingest', {
    method: 'POST',
    body: JSON.stringify({
      courseId,
      filename: file.name,
      documentType,
      contentBase64,
    }),
  });
}

export async function sendChat({ courseId, message, explainSimply }) {
  return request('chat', {
    method: 'POST',
    body: JSON.stringify({ courseId, message, explainSimply }),
  });
}

export async function createStudyPlan({ courseId, availableMinutes }) {
  return request('study-plan', {
    method: 'POST',
    body: JSON.stringify({ courseId, availableMinutes }),
  });
}

export async function createQuiz({ courseId, numberOfQuestions }) {
  return request('quiz', {
    method: 'POST',
    body: JSON.stringify({ courseId, numberOfQuestions }),
  });
}

export async function retrieveDebug({ courseId, question, includeAnswer = true, explainSimply = false }) {
  return request('retrieve', {
    method: 'POST',
    body: JSON.stringify({ courseId, question, includeAnswer, explainSimply }),
  });
}

export function friendlyError(error) {
  if (!error) return 'Something went wrong. Please try again.';
  if (error.code === 'LLM_LIMIT' || error.status === 429) {
    return 'The free AI usage limit has been reached. Please try again later.';
  }
  return error.message || 'Something went wrong. Please try again.';
}
