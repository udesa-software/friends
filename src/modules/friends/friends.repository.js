const { query } = require('../../config/database');

const friendsRepository = {
  // Busca amistad en cualquier dirección (CA.1, CA.3)
  async findByPair(userAId, userBId) {
    const result = await query(
      `SELECT * FROM friends
       WHERE (requester_id = $1 AND addressee_id = $2)
          OR (requester_id = $2 AND addressee_id = $1)`,
      [userAId, userBId]
    );
    return result.rows[0] ?? null;
  },

  // Cuenta solicitudes enviadas en la última hora (CA.5)
  async countRequestsInLastHour(requesterId) {
    const result = await query(
      `SELECT COUNT(*) as count FROM friends
       WHERE requester_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [requesterId]
    );
    return parseInt(result.rows[0].count, 10);
  },

  // Verifica si blockerId tiene bloqueado a blockedId (CA.4)
  async isBlockedBy(blockerId, blockedId) {
    const result = await query(
      `SELECT id FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`,
      [blockerId, blockedId]
    );
    return result.rows.length > 0;
  },

  // Crea solicitud en estado pendiente (CA.2)
  async create(requesterId, addresseeId) {
    const result = await query(
      `INSERT INTO friends (requester_id, addressee_id, status)
       VALUES ($1, $2, 'pending')
       RETURNING *`,
      [requesterId, addresseeId]
    );
    return result.rows[0];
  },

  // Acepta la amistad inversa pendiente (CA.3)
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

  // Elimina solicitud de amistad por ID
  async deleteById(friendsId) {
    const result = await query(
      `DELETE FROM friends
       WHERE id = $1
       RETURNING *`,
      [friendsId]
    );
    return result.rows[0] ?? null;
  }
};

module.exports = { friendsRepository };
