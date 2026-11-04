CREATE EXTENSION IF NOT EXISTS vector;

-- Al ejecutar crear-tabla.mjs, esta tabla se recrea desde cero.
DROP TABLE IF EXISTS fragmentos;

CREATE TABLE fragmentos (
  id        SERIAL PRIMARY KEY,
  juego     TEXT NOT NULL,
  origen    TEXT NOT NULL,
  seccion   TEXT NOT NULL,
  posicion  INTEGER NOT NULL,
  texto     TEXT NOT NULL,
  embedding VECTOR(1024) NOT NULL,
  UNIQUE (posicion)
);

CREATE INDEX fragmentos_juego_idx
  ON fragmentos (juego);

CREATE INDEX fragmentos_embedding_idx
  ON fragmentos USING hnsw (embedding vector_cosine_ops);