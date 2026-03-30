CREATE TABLE IF NOT EXISTS user_privacy (
    user_id    UUID PRIMARY KEY,
    is_private BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT NOW()
);
