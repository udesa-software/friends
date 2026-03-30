-- CA.2: eliminación lógica al rechazar solicitudes
-- Agrega columna deleted_at para soft delete en la tabla friends.
-- Se reemplaza el UNIQUE constraint por un partial unique index
-- que solo aplica a registros no eliminados, permitiendo reenvío
-- de solicitudes después de un rechazo.

ALTER TABLE friends ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL;

-- Eliminar el constraint UNIQUE original y reemplazarlo con un índice parcial
-- que ignora registros eliminados lógicamente.
ALTER TABLE friends DROP CONSTRAINT IF EXISTS friends_unique_pair;

CREATE UNIQUE INDEX IF NOT EXISTS friends_unique_pair_active
  ON friends (requester_id, addressee_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_friends_deleted_at ON friends(deleted_at);
