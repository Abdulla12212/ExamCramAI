import { withHandler, json, parseJsonBody } from '../../server/http.js';
import { isUuid } from '../../server/config.js';
import { AppError, ERRORS } from '../../server/errors.js';
import { createCourse, getCourse, listDocuments } from '../../server/retrieval.js';

export async function handler(event) {
  return withHandler(event, async () => {
    if (event.httpMethod === 'GET') {
      const courseId = event.queryStringParameters?.courseId;
      if (!isUuid(courseId)) {
        throw new AppError(ERRORS.INVALID_COURSE.code, ERRORS.INVALID_COURSE.message, 400);
      }
      const course = await getCourse(courseId);
      if (!course) {
        return json(404, { success: false, code: 'NOT_FOUND', error: 'Course not found.' });
      }
      const documents = await listDocuments(courseId);
      return json(200, { success: true, course, documents });
    }

    if (event.httpMethod !== 'POST') {
      return json(405, { success: false, error: 'Method not allowed.' });
    }

    const body = parseJsonBody(event);
    const name = String(body.name || 'My Course').trim().slice(0, 120);
    const course = await createCourse(name || 'My Course');
    return json(200, { success: true, course });
  });
}
