-- Migración aditiva: no toca fragmentos, embeddings ni el corpus.
CREATE TABLE IF NOT EXISTS rag_cuotas_diarias (
  usuario_id TEXT NOT NULL, ambito TEXT NOT NULL, dia DATE NOT NULL, usadas INTEGER NOT NULL CHECK (usadas >= 0),
  PRIMARY KEY (usuario_id, ambito, dia)
);
CREATE TABLE IF NOT EXISTS rag_consultas (
  id UUID PRIMARY KEY, usuario_id TEXT NOT NULL, ambito TEXT NOT NULL, clave TEXT NOT NULL, huella TEXT NOT NULL,
  entrada JSONB NOT NULL, estado TEXT NOT NULL CHECK (estado IN ('procesando','terminada')),
  salida JSONB, http_estado INTEGER, duracion_ms INTEGER,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now(), terminada_en TIMESTAMPTZ,
  UNIQUE (usuario_id, ambito, clave)
);
CREATE INDEX IF NOT EXISTS rag_consultas_usuario_idx ON rag_consultas (usuario_id, creada_en);
CREATE TABLE IF NOT EXISTS rag_llamadas (
  id UUID PRIMARY KEY, consulta_id UUID NOT NULL REFERENCES rag_consultas(id),
  etapa TEXT NOT NULL, proveedor TEXT NOT NULL, modelo TEXT NOT NULL, intento INTEGER NOT NULL,
  resultado TEXT NOT NULL, entrada_tokens INTEGER, salida_tokens INTEGER, cache_tokens INTEGER, escritura_cache_tokens INTEGER, uso JSONB,
  duracion_ms INTEGER NOT NULL, costo_estimado NUMERIC, moneda TEXT,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rag_llamadas_consulta_idx ON rag_llamadas (consulta_id);
