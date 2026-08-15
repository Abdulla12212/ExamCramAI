import { withHandler, json, parseJsonBody } from '../../server/http.js';
import { isUuid } from '../../server/config.js';
import { AppError, ERRORS } from '../../server/errors.js';
import { listDocuments, sampleCourseChunks, searchCourse, sourceLabel } from '../../server/retrieval.js';
import { generateStructured } from '../../server/llm.js';
import { buildStudyPlanPrompt, STUDY_PLAN_SCHEMA } from '../../server/prompts.js';

function uniqueTopicsFromChunks(chunks) {
  const counts = new Map();
  for (const chunk of chunks) {
    const label = sourceLabel(chunk);
    const preview = String(chunk.content || '')
      .split(/[.?!]/)[0]
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 90);
    const key = preview || label;
    if (!counts.has(key)) {
      counts.set(key, { title: key, label, hits: 0, pastExamHits: 0 });
    }
    const entry = counts.get(key);
    entry.hits += 1;
    if (chunk.document_type === 'past_exam' || chunk.documentType === 'past_exam') {
      entry.pastExamHits += 1;
    }
  }
  return [...counts.values()].sort((a, b) => b.hits + b.pastExamHits * 2 - (a.hits + a.pastExamHits * 2));
}

export async function handler(event) {
  return withHandler(event, async () => {
    if (event.httpMethod !== 'POST') {
      return json(405, { success: false, error: 'Method not allowed.' });
    }

    const body = parseJsonBody(event);
    const courseId = body.courseId;
    const availableMinutes = Math.max(15, Math.min(720, Number(body.availableMinutes) || 180));

    if (!isUuid(courseId)) {
      throw new AppError(ERRORS.INVALID_COURSE.code, ERRORS.INVALID_COURSE.message, 400);
    }

    const documents = await listDocuments(courseId);
    if (!documents.length) {
      throw new AppError(
        'NO_DOCUMENTS',
        'Upload course material before creating a study plan.',
        400
      );
    }

    const materialDocs = documents.filter((doc) => doc.document_type === 'course_material');
    const pastExamDocs = documents.filter((doc) => doc.document_type === 'past_exam');

    const [overviewChunks, pastExamChunks, rankedChunks] = await Promise.all([
      sampleCourseChunks(courseId, 'course_material', 20),
      pastExamDocs.length ? sampleCourseChunks(courseId, 'past_exam', 16) : Promise.resolve([]),
      searchCourse(courseId, 'key concepts definitions formulas theorems methods', 8),
    ]);

    const topicRows = uniqueTopicsFromChunks([...overviewChunks, ...rankedChunks, ...pastExamChunks]);
    const topicList = topicRows
      .slice(0, 12)
      .map((topic, index) => {
        const past = topic.pastExamHits
          ? 'Appears frequently in the uploaded past exams.'
          : 'Ranked from uploaded course material only.';
        return `${index + 1}. ${topic.title}\n   evidence: ${past}`;
      })
      .join('\n');

    const pastExamNotes = pastExamDocs.length
      ? `Past exams uploaded: ${pastExamDocs.map((doc) => doc.filename).join(', ')}.\nUse overlap with lectures to raise priority. Never say a topic will definitely be on the exam.`
      : 'No past exams were uploaded. Do not claim exam likelihood.';

    const plan = await generateStructured(
      buildStudyPlanPrompt({
        minutes: availableMinutes,
        topics: topicList || 'Not enough indexed material to rank topics.',
        pastExamNotes,
      }),
      STUDY_PLAN_SCHEMA
    );

    return json(200, {
      success: true,
      availableMinutes,
      hasPastExams: pastExamDocs.length > 0,
      materialCount: materialDocs.length,
      pastExamCount: pastExamDocs.length,
      plan,
    });
  });
}
