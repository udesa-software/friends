ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'discarded'));

CREATE INDEX IF NOT EXISTS idx_reports_status_reported ON reports (status, reported_id);
