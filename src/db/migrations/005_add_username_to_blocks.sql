-- H8: denormalizar el username del usuario bloqueado para evitar llamadas al servicio de usuarios.
-- El username se almacena al momento del bloqueo (del body de la request del bloqueador).
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS blocked_username VARCHAR(255) NULL;
