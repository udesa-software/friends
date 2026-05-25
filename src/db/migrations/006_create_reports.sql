-- H9: tabla de reportes de usuarios
-- CA.3: el índice parcial permite consultar eficientemente reportes recientes por par
-- CA.2: consultamos distinct reporter_id para contar reportes únicos

CREATE TABLE IF NOT EXISTS reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID        NOT NULL,
  reported_id UUID        NOT NULL,
  reason      VARCHAR(100) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reports_no_self CHECK (reporter_id != reported_id)
);

-- Para CA.2: contar reportantes únicos de un usuario
CREATE INDEX IF NOT EXISTS idx_reports_reported_id ON reports (reported_id);

-- Para CA.3: verificar si ya existe reporte reciente del par en 24h
CREATE INDEX IF NOT EXISTS idx_reports_pair_time ON reports (reporter_id, reported_id, created_at DESC);
