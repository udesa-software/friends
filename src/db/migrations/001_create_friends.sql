CREATE TABLE IF NOT EXISTS friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL,
  addressee_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT friends_unique_pair UNIQUE (requester_id, addressee_id),
  CONSTRAINT friends_no_self CHECK (requester_id != addressee_id),
  CONSTRAINT friends_status_check CHECK (status IN ('pending', 'accepted'))
);

CREATE INDEX IF NOT EXISTS idx_friends_requester ON friends(requester_id);
CREATE INDEX IF NOT EXISTS idx_friends_addressee ON friends(addressee_id);
CREATE INDEX IF NOT EXISTS idx_friends_status ON friends(status);
