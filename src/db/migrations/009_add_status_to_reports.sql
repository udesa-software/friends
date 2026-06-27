ALTER TABLE reports
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'discarded'));

CREATE INDEX idx_reports_status_reported ON reports (status, reported_id);
