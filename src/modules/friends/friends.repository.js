const { query } = require('../../config/database');

const friendsRepository = {
  // Busca amistad en cualquier dirección (CA.1, CA.3)
  async findByPair(userAId, userBId) {
    const result = await query(
      `SELECT * FROM friendss
       WHERE (requester_id = $1 AND addressee_id = $2)
          OR (requester_id = $2 AND addressee_id = $1)`,
      [userAId, userBId]
    );
    return result.rows[0] ?? null;
  },

  // Cuenta solicitudes enviadas en la última hora (CA.5)
  async countRequestsInLastHour(requesterId) {
    const result = await query(
      `SELECT COUNT(*) FROM friendss
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
      `INSERT INTO friendss (requester_id, addressee_id, status)
       VALUES ($1, $2, 'pending')
       RETURNING *`,
      [requesterId, addresseeId]
    );
    return result.rows[0];
  },

  // Acepta la amistad inversa pendiente (CA.3)
  async acceptById(friendsId) {
    const result = await query(
      `UPDATE friendss
       SET status = 'accepted', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [friendsId]
    );
    return result.rows[0];
  },

  // H7 CA.1 + CA.2: lista amigos confirmados con paginación y orden.
  // El ORDER BY se resuelve con un mapa estático para evitar inyección SQL.
  // sort=alphabetical devuelve el mismo orden que recent: los nombres no están
  // en este servicio, por lo que el ordenamiento alfabético real es responsabilidad
  // del cliente tras enriquecer con datos del servicio de usuarios.
  // Proximidad (CA.1) depende de E.3 Ubicaciones y se implementará en esa épica.
  async listAccepted(userId, { limit, offset, sort }) {
    const ORDER_BY_MAP = {
      recent: 'f.updated_at DESC',
      alphabetical: 'f.updated_at DESC',
    };
    const orderBy = ORDER_BY_MAP[sort] ?? ORDER_BY_MAP.recent;

    const result = await query(
      `SELECT
         CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END AS friend_id,
         f.updated_at
       FROM friendss f
       WHERE (f.requester_id = $1 OR f.addressee_id = $1)
         AND f.status = 'accepted'
       ORDER BY ${orderBy}
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  },

  async countAccepted(userId) {
    const result = await query(
      `SELECT COUNT(*) FROM friendss
       WHERE (requester_id = $1 OR addressee_id = $1)
         AND status = 'accepted'`,
      [userId]
    );
    return parseInt(result.rows[0].count, 10);
  },
};

module.exports = { friendsRepository };
