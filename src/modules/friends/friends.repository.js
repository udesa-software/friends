const { query } = require('../../config/database');

const friendsRepository = {
  // Busca amistad activa en cualquier dirección (excluye soft-deleted)
  async findByPair(userAId, userBId) {
    const result = await query(
      `SELECT * FROM friends
       WHERE ((requester_id = $1 AND addressee_id = $2)
           OR (requester_id = $2 AND addressee_id = $1))
         AND deleted_at IS NULL`,
      [userAId, userBId]
    );
    return result.rows[0] ?? null;
  },

  // Cuenta solicitudes enviadas en la última hora
  async countRequestsInLastHour(requesterId) {
    const result = await query(
      `SELECT COUNT(*) as count FROM friends
       WHERE requester_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [requesterId]
    );
    return parseInt(result.rows[0].count, 10);
  },

  // Verifica si blockerId tiene bloqueado a blockedId
  async isBlockedBy(blockerId, blockedId) {
    const result = await query(
      `SELECT id FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`,
      [blockerId, blockedId]
    );
    return result.rows.length > 0;
  },

  // Crea solicitud en estado pendiente almacenando el username del emisor (del JWT).
  // El username del destinatario se guarda al aceptar (ver acceptById).
  async create(requesterId, requesterUsername, addresseeId) {
    const result = await query(
      `INSERT INTO friends (requester_id, requester_username, addressee_id, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [requesterId, requesterUsername, addresseeId]
    );
    return result.rows[0];
  },

  // Acepta la solicitud actualizando el status a 'accepted' y guardando el
  // username del aceptante (addressee de la solicitud original, del JWT).
  async acceptById(friendsId, addresseeUsername) {
    const result = await query(
      `UPDATE friends
       SET status = 'accepted', updated_at = NOW(), addressee_username = $2
       WHERE id = $1
       RETURNING *`,
      [friendsId, addresseeUsername]
    );
    return result.rows[0];
  },

  // Elimina la amistad en cualquier dirección (H3 - CA.3)
  async removeByPair(userAId, userBId) {
    const result = await query(
      `DELETE FROM friends
       WHERE (requester_id = $1 AND addressee_id = $2)
          OR (requester_id = $2 AND addressee_id = $1)
       RETURNING *`,
      [userAId, userBId]
    );
    return result.rows[0] ?? null;
  },
  
  // CA.2: eliminación lógica — marca la solicitud como eliminada sin borrarla físicamente
  async softDeleteById(friendsId) {
    const result = await query(
      `UPDATE friends
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [friendsId]
    );
    return result.rows[0] ?? null;
  },

  // CA.3/CA.4/CA.5: devuelve los IDs de los emisores con solicitudes pendientes hacia addresseeId.
  // Se usa para filtrar usuarios inactivos antes de paginar.
  async getPendingRequesterIds(addresseeId) {
    const result = await query(
      `SELECT requester_id FROM friends
       WHERE addressee_id = $1
         AND status = 'pending'
         AND deleted_at IS NULL`,
      [addresseeId]
    );
    return result.rows.map((r) => r.requester_id);
  },

  // H7: devuelve amigos confirmados con su username, ordenados alfabéticamente.
  // Usa CASE para obtener los datos del amigo (el que NO es userId) en cada fila.
  // NULLS LAST para tolerar filas antiguas sin username migrado.
  async getConfirmedFriends(userId, limit, offset) {
    const result = await query(
      `SELECT
         CASE WHEN requester_id = $1 THEN addressee_id    ELSE requester_id    END AS friend_id,
         CASE WHEN requester_id = $1 THEN addressee_username ELSE requester_username END AS friend_username,
         COUNT(*) OVER() AS total_count
       FROM friends
       WHERE (requester_id = $1 OR addressee_id = $1)
         AND status = 'accepted'
         AND deleted_at IS NULL
       ORDER BY
         CASE WHEN requester_id = $1 THEN addressee_username ELSE requester_username END ASC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    const total = result.rows[0]?.total_count
      ? parseInt(result.rows[0].total_count, 10)
      : 0;
    return { rows: result.rows, total };
  },

  // H5-friends: devuelve todos los IDs de amigos confirmados de un usuario (sin paginar).
  // Usado por el endpoint interno que llama el servicio de location.
  async getConfirmedFriendIds(userId) {
    const result = await query(
      `SELECT
         CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS friend_id
       FROM friends
       WHERE (requester_id = $1 OR addressee_id = $1)
         AND status = 'accepted'
         AND deleted_at IS NULL`,
      [userId]
    );
    return result.rows.map((r) => r.friend_id);
  },

  // H4 CA.2/CA.4: soft-delete de todas las relaciones (accepted o pending) de un usuario eliminado.
  async softDeleteAllByUserId(userId) {
    const result = await query(
      `UPDATE friends
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE (requester_id = $1 OR addressee_id = $1)
         AND deleted_at IS NULL
       RETURNING id`,
      [userId]
    );
    return result.rowCount;
  },

  // CA.3/CA.5: devuelve solicitudes pendientes paginadas, filtradas por emisores activos.
  // Usa COUNT(*) OVER() para obtener el total real con los mismos filtros en una sola query.
  async getPendingRequests(addresseeId, activeRequesterIds, limit, offset) {
    const result = await query(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM friends
       WHERE addressee_id = $1
         AND status = 'pending'
         AND deleted_at IS NULL
         AND requester_id = ANY($2::uuid[])
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [addresseeId, activeRequesterIds, limit, offset]
    );
    const total = result.rows[0]?.total_count
      ? parseInt(result.rows[0].total_count, 10)
      : 0;
    return { rows: result.rows, total };
  },

  // H8: crea un registro de bloqueo almacenando el username del bloqueado.
  // ON CONFLICT DO NOTHING para tolerar re-bloqueos sin error de DB.
  async createBlock(blockerId, blockedId, blockedUsername) {
    const result = await query(
      `INSERT INTO blocks (blocker_id, blocked_id, blocked_username)
       VALUES ($1, $2, $3)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING
       RETURNING *`,
      [blockerId, blockedId, blockedUsername]
    );
    return result.rows[0] ?? null;
  },

  // H8 CA.2: elimina el bloqueo (desbloquear)
  async removeBlock(blockerId, blockedId) {
    const result = await query(
      `DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2 RETURNING *`,
      [blockerId, blockedId]
    );
    return result.rows[0] ?? null;
  },

  // H8 CA.2: lista paginada de usuarios bloqueados por blockerId, con username incluido.
  async getBlockedUsers(blockerId, limit, offset) {
    const result = await query(
      `SELECT blocked_id, blocked_username, created_at, COUNT(*) OVER() AS total_count
       FROM blocks
       WHERE blocker_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [blockerId, limit, offset]
    );
    const total = result.rows[0]?.total_count
      ? parseInt(result.rows[0].total_count, 10)
      : 0;
    return { rows: result.rows, total };
  },
};

module.exports = { friendsRepository };
