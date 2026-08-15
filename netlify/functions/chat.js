import { withHandler, json, parseJsonBody } from '../../server/http.js';
import { isUuid } from '../../server/config.js';
import { AppError, ERRORS } from '../../server/errors.js';
import { searchCourse, toClientSources } from '../../server/retrieval.js';
import { generateText } from '../../server/llm.js';
import { buildGroundedPrompt } from '../../server/prompts.js';

const NO_ANSWER =
  "I couldn't find enough information in your uploaded course material to answer that confidently.";

function looksUnanswered(text) {
  return /couldn['’]t find enough information/i.test(text || '');
}

export async function handler(event) {
  return withHandler(event, async () => {
    if (event.httpMethod !== 'POST') {
      return json(405, { success: false, error: 'Method not allowed.' });
    }

    const body = parseJsonBody(event);
    const courseId = body.courseId;
    const message = String(body.message || '').trim();
    const explainSimply = Boolean(body.explainSimply);

    if (!isUuid(courseId)) {
      throw new AppError(ERRORS.INVALID_COURSE.code, ERRORS.INVALID_COURSE.message, 400);
    }
    if (!message) {
      throw new AppError('INVALID_MESSAGE', 'Please enter a question.', 400);
    }

    const chunks = await searchCourse(courseId, message, 6);
    const usable = chunks.filter((chunk) => chunk.similarity >= 0.25);

    if (!usable.length) {
      return json(200, {
        success: true,
        answer: NO_ANSWER,
        sources: [],
        retrieved: chunks,
      });
    }

    const prompt = buildGroundedPrompt({
      question: message,
      chunks: usable,
      explainSimply,
    });
    const answer = await generateText(prompt);

    if (looksUnanswered(answer)) {
      return json(200, {
        success: true,
        answer: NO_ANSWER,
        sources: [],
        retrieved: usable,
      });
    }

    return json(200, {
      success: true,
      answer,
      sources: toClientSources(usable),
      retrieved: usable.map((chunk) => ({
        id: chunk.id,
        document: chunk.document,
        page: chunk.page,
        slide: chunk.slide,
        similarity: chunk.similarity,
      })),
    });
  });
}
