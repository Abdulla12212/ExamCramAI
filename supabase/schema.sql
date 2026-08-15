-- ExamCram AI schema
-- Run this in the Supabase SQL editor before first deploy.
-- Embedding dimension MUST match EMBEDDING_DIMENSIONS (default 768).

create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Course',
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  filename text not null,
  file_type text not null check (file_type in ('pdf', 'pptx')),
  document_type text not null default 'course_material'
    check (document_type in ('course_material', 'past_exam')),
  created_at timestamptz not null default now()
);

create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  content text not null,
  page_number integer,
  slide_number integer,
  chunk_index integer not null default 0,
  embedding vector(768),
  created_at timestamptz not null default now()
);

create index if not exists documents_course_id_idx on documents (course_id);
create index if not exists document_chunks_course_id_idx on document_chunks (course_id);
create index if not exists document_chunks_document_id_idx on document_chunks (document_id);

-- HNSW is efficient for the free-tier demo size and cosine similarity.
create index if not exists document_chunks_embedding_hnsw
  on document_chunks
  using hnsw (embedding vector_cosine_ops);

-- Service-role only: the browser never talks to Postgres directly.
alter table courses enable row level security;
alter table documents enable row level security;
alter table document_chunks enable row level security;

create or replace function match_document_chunks(
  query_embedding vector(768),
  match_count integer,
  course_id uuid
)
returns table (
  id uuid,
  content text,
  document_name text,
  page_number integer,
  slide_number integer,
  similarity double precision,
  document_id uuid,
  document_type text,
  chunk_index integer
)
language plpgsql
stable
as $$
begin
  if match_count is null or match_count < 1 then
    match_count := 6;
  end if;

  return query
  select
    dc.id,
    dc.content,
    d.filename as document_name,
    dc.page_number,
    dc.slide_number,
    (1 - (dc.embedding <=> query_embedding))::double precision as similarity,
    dc.document_id,
    d.document_type,
    dc.chunk_index
  from document_chunks dc
  inner join documents d on d.id = dc.document_id
  where dc.course_id = match_document_chunks.course_id
    and dc.embedding is not null
  order by dc.embedding <=> query_embedding
  limit match_count;
end;
$$;
