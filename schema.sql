--  RUN 1st
create extension vector;

-- RUN 2nd
create table episode_embeddings (
  id bigserial primary key,
  episode_title text,
  episode_url text,
  episode_date text,
  episode_thanks text,
  content text,
  content_length bigint,
  content_tokens bigint,
  chunk_id bigint,
  episode_id bigint,
  embedding vector (1536)
);

-- RUN 3rd after running the scripts
create or replace function embed_search (
  query_embedding vector(1536),
  similarity_threshold float,
  match_count int
)
returns table (
  id bigint,
  episode_title text,
  episode_url text,
  episode_date text,
  episode_thanks text,
  content text,
  content_length bigint,
  content_tokens bigint,
  similarity float
)
language plpgsql
as $$

begin
  return query
  select
    episode_embeddings.id,
    episode_embeddings.episode_title,
    episode_embeddings.episode_url,
    episode_embeddings.episode_date,
    episode_embeddings.content,
    episode_embeddings.content_length,
    episode_embeddings.content_tokens,
    1 - (episode_embeddings.embedding <=> query_embedding) as similarity
  from episode_embeddings
  where 1 - (episode_embeddings.embedding <=> query_embedding) > similarity_threshold
  order by episode_embeddings.embedding <=> query_embedding
  limit match_count;
end;

$$;

-- RUN 4th
create index on embed_search
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);