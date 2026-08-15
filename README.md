# ExamCram AI

A last-minute study assistant. Students upload lecture PDFs and PPTX slides, then ask questions that are answered only from that material, with real page/slide citations.

This is a **$0-cost MVP**: Netlify free tier + Supabase free tier + Gemini API free tier. It is **not unlimited free AI**.

## What it does

1. Upload course PDFs and PPTX files (lectures or past exams).
2. Parse, chunk, embed, and store them in Supabase pgvector.
3. Ask questions grounded in the uploaded files.
4. See exact source pages/slides chosen by retrieval, not invented by the model.
5. Generate a timed study plan.
6. Generate an interactive practice quiz.
7. Inspect retrieval quality on the RAG Eval screen.

## Architecture

```text
React / Vite  →  Netlify  →  Netlify Functions
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
                 Parser       Retrieval     LLM adapter
                    │             │             │
                    ▼             ▼             ▼
               Course chunks   Supabase      Gemini
               + embeddings    pgvector      free tier
```

The application never calls Gemini outside `server/llm.js`. Embeddings live in `server/embeddings.js`. Swap providers later by adding a new adapter behind the same `generateText` / `generateEmbedding` functions.

## Free-tier limits (read this)

Do not advertise ExamCram as unlimited.

| Service | Typical free-tier constraint | What the app does when it runs out |
| --- | --- | --- |
| Gemini text (`gemini-3.5-flash` by default) | Request/day and tokens/minute caps. Google changes these; check [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing). | Shows: **The free AI usage limit has been reached. Please try again later.** |
| Gemini embeddings (`gemini-embedding-001`, 768 dimensions) | Separate embedding quota on the same API key. | Same limit message. No silent fallback to a paid provider. |
| Netlify functions | Short timeouts and invocation caps on the free plan. Large files may fail to index. | Upload error. Keep files under **4.5 MB**. |
| Supabase | Database size and row limits on the free plan. | “We couldn't access your course index.” |

If Gemini quota is exhausted, configure another provider later (`LLM_PROVIDER=cloudflare|local|openai|anthropic`). Those adapters are stubs in this MVP. Only Gemini is implemented.

## Setup

### 1. Supabase

1. Create a free project.
2. Open **SQL Editor**.
3. Run [`supabase/schema.sql`](supabase/schema.sql).
4. Copy the project URL and **service role** key. Never put the service role key in frontend code or `VITE_` variables.

The embedding column is `vector(768)`. If you change `EMBEDDING_DIMENSIONS`, change the schema to match and re-index.

### 2. Gemini

1. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Default model: `gemini-3.5-flash` (a current free-tier Flash model). Override with `GEMINI_MODEL` if Google renames models.
3. Embeddings use `gemini-embedding-001` at 768 dimensions on the same key unless `EMBEDDING_API_KEY` is set.

### 3. Environment

Copy `.env.example` to `.env` for local `netlify dev`, and set the same values in the Netlify UI for production:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
LLM_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
EMBEDDING_PROVIDER=gemini
EMBEDDING_API_KEY=
EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSIONS=768
```

### 4. Install and run

```bash
npm install
npm run build
```

Local full stack:

```bash
npx netlify dev
```

That serves the Vite app and functions together (default http://localhost:8888). `npm run dev` alone only runs the frontend.

## Deploy on Netlify

1. Push this repo to GitHub.
2. Add a new Netlify site from that repo.
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Functions directory: `netlify/functions`
6. Add the environment variables above.
7. Deploy.

SPA routing is already configured in `netlify.toml`.

## Demo flow

1. Upload 2–3 lecture PDFs or PPTX files.
2. Ask: **Explain neural networks** (or whatever the files actually cover).
3. Confirm sources show real pages/slides.
4. Toggle **Explain simply**.
5. Open **Study Plan**, enter 120 minutes.
6. Open **Quiz** and take five questions.
7. Optionally upload a past exam as **📝 Past Exam**.
8. Open **RAG Eval** and run the 10 test questions.

## RAG evaluation

The **RAG Eval** screen shows:

- the question
- retrieved chunks with similarity scores
- the generated answer
- citations attached by the backend
- a checklist for retrieval, grounding, citation accuracy, and refusal

Test questions 9 and 10 are deliberately unsupported. The model should refuse instead of inventing an answer.

## Security notes

- Secrets stay in Netlify Functions. The browser never receives `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, or `EMBEDDING_API_KEY`.
- File type is checked from filename and magic bytes.
- Uploads are capped at 4.5 MB.
- Course IDs must be UUIDs.
- Answers are rendered as text, not HTML.
- There is no authentication in this MVP. Anyone with a course UUID can query that course.

## Project layout

```text
src/                  React UI
netlify/functions/    ingest, chat, study-plan, quiz, retrieve, course
server/               parsers, chunking, embeddings, retrieval, LLM adapter
supabase/schema.sql   pgvector schema + match_document_chunks()
```

## What this MVP does not include

User accounts, payments, OCR for scanned PDFs, agents, fine-tuning, or a Python backend.
