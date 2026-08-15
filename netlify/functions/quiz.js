import { withHandler, json, parseJsonBody } from '../../server/http.js';
import { isUuid } from '../../server/config.js';
import { AppError, ERRORS } from '../../server/errors.js';
import { searchCourse, toClientSources } from '../../server/retrieval.js';
import { generateStructured } from '../../server/llm.js';
import { buildQuizPrompt, QUIZ_SCHEMA } from '../../server/prompts.js';

function mapSources(sourceIds, chunkById) {
  const chunks = [];
  for (const id of sourceIds || []) {
    const chunk = chunkById.get(String(id));
    if (chunk) chunks.push(chunk);
  }
  return toClientSources(chunks);
}

export async function handler(event) {
  return withHandler(event, async () => {
    if (event.httpMethod !== 'POST') {
      return json(405, { success: false, error: 'Method not allowed.' });
    }

    const body = parseJsonBody(event);
    const courseId = body.courseId;
    const numberOfQuestions = Math.max(3, Math.min(10, Number(body.numberOfQuestions) || 5));

    if (!isUuid(courseId)) {
      throw new AppError(ERRORS.INVALID_COURSE.code, ERRORS.INVALID_COURSE.message, 400);
    }

    const chunks = await searchCourse(
      courseId,
      'important definitions concepts methods formulas examples that could appear on a quiz',
      10
    );

    const usable = chunks.filter((chunk) => chunk.similarity >= 0.2);
    if (usable.length < 2) {
      throw new AppError(
        'NO_ANSWER',
        "I couldn't find enough information in your uploaded course material to build a quiz yet.",
        422
      );
    }

    const chunkById = new Map(usable.map((chunk) => [String(chunk.id), chunk]));
    const generated = await generateStructured(
      buildQuizPrompt({ numberOfQuestions, chunks: usable }),
      QUIZ_SCHEMA
    );

    const questions = (generated.questions || [])
      .slice(0, numberOfQuestions)
      .map((item, index) => {
        const options = Array.isArray(item.options) ? item.options.slice(0, 4) : [];
        const correctAnswer = Number.isInteger(item.correctAnswer)
          ? Math.max(0, Math.min(options.length - 1, item.correctAnswer))
          : 0;
        const sources = mapSources(item.sourceIds, chunkById);
        return {
          id: `q-${index + 1}`,
          question: String(item.question || '').trim(),
          options,
          correctAnswer,
          explanation: String(item.explanation || '').trim(),
          sources,
        };
      })
      .filter((item) => item.question && item.options.length === 4);

    if (!questions.length) {
      throw new AppError('LLM_PARSE', 'Quiz generation did not return usable questions. Please try again.', 502);
    }

    return json(200, { success: true, questions });
  });
}
