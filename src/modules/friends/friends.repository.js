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

  // Crea solicitud en estado pendiente
  async create(requesterId, addresseeId) {
    const result = await query(
      `INSERT INTO friends (requester_id, addressee_id, status)
       VALUES ($1, $2, 'pending')
       RETURNING *`,
      [requesterId, addresseeId]
    );
    return result.rows[0];
  },

  // Acepta la solicitud actualizando el status a 'accepted'
  async acceptById(friendsId) {
    const result = await query(
      `UPDATE friends
       SET status = 'accepted', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [friendsId]
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

  // H8: crea un bloqueo de blockerId hacia blockedId.
  // ON CONFLICT DO NOTHING hace la operación idempotente: bloquear dos veces no es error.
  async createBlock(blockerId, blockedId) {
    const result = await query(
      `INSERT INTO blocks (blocker_id, blocked_id)
       VALUES ($1, $2)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING
       RETURNING *`,
      [blockerId, blockedId]
    );
    return result.rows[0] ?? null;
  },

  // H8: elimina el bloqueo de blockerId hacia blockedId.
  // Devuelve null si no existía el bloqueo.
  async deleteBlock(blockerId, blockedId) {
    const result = await query(
      `DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2 RETURNING *`,
      [blockerId, blockedId]
    );
    return result.rows[0] ?? null;
  },

  // H8 CA.2: lista todos los usuarios bloqueados por blockerId, ordenados por fecha descendente.
  async getBlockedUserIds(blockerId) {
    const result = await query(
      `SELECT blocked_id, created_at FROM blocks WHERE blocker_id = $1 ORDER BY created_at DESC`,
      [blockerId]
    );
    return result.rows;
  },

  // H8 CA.3: soft-delete de la amistad entre userAId y userBId en cualquier dirección.
  // Se ejecuta al bloquear para romper automáticamente relaciones pendientes o aceptadas.
  async softDeleteFriendshipByPair(userAId, userBId) {
    const result = await query(
      `UPDATE friends
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE ((requester_id = $1 AND addressee_id = $2)
           OR (requester_id = $2 AND addressee_id = $1))
         AND deleted_at IS NULL
       RETURNING *`,
      [userAId, userBId]
    );
    return result.rows[0] ?? null;
  },
};

module.exports = { friendsRepository };
