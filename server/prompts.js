import { sourceLabel } from './retrieval.js';

export const SYSTEM_INSTRUCTION = `You are ExamCram, a study assistant.

Answer the student's question using only the supplied course material.

Do not use outside knowledge.

If the supplied material does not contain enough information,
say:

"I couldn't find enough information in your course material
to answer that confidently."

Never invent:
- facts
- formulas
- page numbers
- slide numbers
- sources

Explain concepts clearly and simply.

The retrieved material contains source metadata.
Use only those sources.`;

export const ELI5_INSTRUCTION = `Explain the concept as if teaching a five-year-old.

Use a simple analogy.

Avoid unnecessary jargon.

Do not change the factual meaning.`;

export function formatRetrievedMaterial(chunks) {
  return chunks
    .map((chunk) => {
      const heading = sourceLabel(chunk);
      return `[${heading}]\n${chunk.content}`;
    })
    .join('\n\n');
}

export function buildGroundedPrompt({ question, chunks, explainSimply = false }) {
  const material = formatRetrievedMaterial(chunks);
  const extra = explainSimply ? `\n\n${ELI5_INSTRUCTION}` : '';

  return `${SYSTEM_INSTRUCTION}${extra}

COURSE MATERIAL:

${material}

STUDENT QUESTION:
${question}

Write a clear answer grounded only in the course material above.
Do not include a sources list. The application will attach real citations separately.`;
}

export function buildStudyPlanPrompt({ minutes, topics, pastExamNotes }) {
  return `You are ExamCram, a last-minute study planner.

Turn the ranked topics below into a realistic study plan for ${minutes} minutes.

Rules:
- Use only the supplied topics and notes.
- Do not claim something "will be on the exam" unless past-exam evidence is provided.
- If past-exam evidence exists, you may say: "Appears frequently in the uploaded past exams."
- Prefer wording such as "high priority from your lectures" when there is no past-exam overlap.
- Allocate time that sums to about ${minutes} minutes.
- Include short, practical actions (review, recap, quiz yourself).

RANKED TOPICS:
${topics}

PAST EXAM NOTES:
${pastExamNotes || 'No past exams were uploaded.'}

Return JSON with:
{
  "headline": string,
  "blocks": [
    {
      "minutes": number,
      "title": string,
      "why": string,
      "actions": [string]
    }
  ],
  "disclaimer": string
}`;
}

export const STUDY_PLAN_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          minutes: { type: 'integer' },
          title: { type: 'string' },
          why: { type: 'string' },
          actions: { type: 'array', items: { type: 'string' } },
        },
        required: ['minutes', 'title', 'why', 'actions'],
      },
    },
    disclaimer: { type: 'string' },
  },
  required: ['headline', 'blocks', 'disclaimer'],
};

export function buildQuizPrompt({ numberOfQuestions, chunks }) {
  const material = chunks
    .map((chunk, index) => {
      return `SOURCE_ID=${chunk.id}
LABEL=${sourceLabel(chunk)}
TEXT=${chunk.content}`;
    })
    .join('\n\n');

  return `You are ExamCram. Create a practice quiz using ONLY the supplied course material.

Rules:
- Generate exactly ${numberOfQuestions} multiple-choice questions.
- Each question must have 4 options.
- correctAnswer is the 0-based index of the right option.
- Every question must include sourceIds drawn from the SOURCE_ID values below.
- Do not invent SOURCE_ID values.
- Do not use outside knowledge.
- Explanations must be grounded in the supplied text.

COURSE MATERIAL:
${material}

Return JSON:
{
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correctAnswer": 0,
      "explanation": "...",
      "sourceIds": ["..."]
    }
  ]
}`;
}

export const QUIZ_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          correctAnswer: { type: 'integer' },
          explanation: { type: 'string' },
          sourceIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['question', 'options', 'correctAnswer', 'explanation', 'sourceIds'],
      },
    },
  },
  required: ['questions'],
};
