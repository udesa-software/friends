-- H9: denuncias de usuarios. Sin UNIQUE(reporter_id, reported_id): CA.3 solo prohíbe
-- repetir la denuncia dentro de 24hs, no para siempre.
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL,
  reporter_username VARCHAR(255) NOT NULL,
  reported_id UUID NOT NULL,
  reported_username VARCHAR(255) NOT NULL,
  reason VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reports_no_self CHECK (reporter_id != reported_id)
);

CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_reported_created ON reports(reporter_id, reported_id, created_at);
