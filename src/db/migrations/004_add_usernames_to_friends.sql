-- H7: denormalizar usernames en la tabla friends para ordenar alfabéticamente
-- sin necesidad de consultar el servicio de usuarios en el listado.
-- El username del requester se almacena al crear la solicitud (del JWT del emisor).
-- El username del addressee se almacena al aceptar la solicitud (del JWT del aceptante).

ALTER TABLE friends ADD COLUMN IF NOT EXISTS requester_username VARCHAR(255) NULL;
ALTER TABLE friends ADD COLUMN IF NOT EXISTS addressee_username VARCHAR(255) NULL;

-- Índices para ORDER BY eficiente en el listado alfabético
CREATE INDEX IF NOT EXISTS idx_friends_requester_username ON friends(requester_username);
CREATE INDEX IF NOT EXISTS idx_friends_addressee_username ON friends(addressee_username);
