import { withHandler, json, parseJsonBody } from '../../server/http.js';
import { isUuid } from '../../server/config.js';
import { AppError, ERRORS } from '../../server/errors.js';
import { searchCourse, toClientSources } from '../../server/retrieval.js';
import { generateText } from '../../server/llm.js';
import { buildGroundedPrompt } from '../../server/prompts.js';

const NO_ANSWER =
  "I couldn't find enough information in your uploaded course material to answer that confidently.";

export async function handler(event) {
  return withHandler(event, async () => {
    if (event.httpMethod !== 'POST') {
      return json(405, { success: false, error: 'Method not allowed.' });
    }

    const body = parseJsonBody(event);
    const courseId = body.courseId;
    const question = String(body.question || body.message || '').trim();
    const includeAnswer = body.includeAnswer !== false;

    if (!isUuid(courseId)) {
      throw new AppError(ERRORS.INVALID_COURSE.code, ERRORS.INVALID_COURSE.message, 400);
    }
    if (!question) {
      throw new AppError('INVALID_MESSAGE', 'Please enter a question.', 400);
    }

    const retrieved = await searchCourse(courseId, question, 8);
    const usable = retrieved.filter((chunk) => chunk.similarity >= 0.25);
    let answer = null;
    let sources = [];

    if (includeAnswer) {
      if (!usable.length) {
        answer = NO_ANSWER;
      } else {
        answer = await generateText(
          buildGroundedPrompt({
            question,
            chunks: usable,
            explainSimply: Boolean(body.explainSimply),
          })
        );
        if (!/couldn['’]t find enough information/i.test(answer)) {
          sources = toClientSources(usable);
        } else {
          answer = NO_ANSWER;
        }
      }
    }

    return json(200, {
      success: true,
      question,
      retrieved: retrieved.map((chunk, index) => ({
        rank: index + 1,
        document: chunk.document,
        page: chunk.page,
        slide: chunk.slide,
        similarity: Number(chunk.similarity.toFixed(4)),
        snippet: chunk.content.slice(0, 280),
        id: chunk.id,
      })),
      answer,
      sources,
    });
  });
}
