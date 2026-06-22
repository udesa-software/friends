// CA.4: cliente HTTP para consultar el servicio de usuarios.
// Permite filtrar solicitudes pendientes cuyos emisores hayan eliminado
// su cuenta o hayan sido suspendidos por un administrador.
//
// PENDIENTE: el servicio de usuarios aún no expone un endpoint inter-servicio
// para consultar el estado de usuarios por ID. Este cliente no está integrado
// en getPendingRequests hasta que dicho endpoint exista.
// El servicio de usuarios necesitará exponer algo como:
//   POST /internal/users/active
//   Body: { userIds: string[] }
//   Response: { activeUserIds: string[] }

const usersClient = {
  /**
   * Recibe un array de user IDs y devuelve solo los que corresponden
   * a cuentas activas (no eliminadas ni suspendidas).
   * @param {string[]} userIds
   * @returns {Promise<string[]>} subset de userIds que están activos
   */
  async getActiveUserIds(userIds) {
    if (!userIds.length) return [];

    const url = `${process.env.USERS_SERVICE_URL}/internal/users/active`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds }),
    });

    if (!response.ok) {
      throw new Error(`Users service error: ${response.status}`);
    }

    const data = await response.json();
    return data.activeUserIds;
  },

  // H10 CA.1: consulta al servicio de usuarios cuáles de los IDs dados
  // estuvieron activos en los últimos 5 minutos (last_seen_at reciente).
  // Devuelve un Set de strings para hacer lookup en O(1) al armar la lista.
  // Si el servicio no está disponible, falla silenciosamente y devuelve Set vacío
  // para no romper la lista de amigos por un error de presencia.
  async getOnlineStatus(userIds) {
    if (!userIds || userIds.length === 0) return new Set();

    const url = `${process.env.USERS_SERVICE_URL}/internal/users/online-status`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds }),
      });

      if (!response.ok) {
        console.warn(`[usersClient] getOnlineStatus responded ${response.status}`);
        return new Set();
      }

      const data = await response.json();
      return new Set(data.onlineIds || []);
    } catch (err) {
      console.warn('[usersClient] getOnlineStatus failed, defaulting to all offline:', err.message);
      return new Set();
    }
  },

  // H9 CA.4: marca al usuario denunciado "en revisión" — el endpoint en users revoca
  // inmediatamente su sesión activa. Requiere x-internal-secret porque la ruta está
  // protegida con authenticateInternal.
  async flagUserForReview(userId) {
    const url = `${process.env.USERS_SERVICE_URL}/internal/users/${userId}/flag-review`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SECRET,
      },
    });

    if (!response.ok) {
      throw new Error(`Users service error: ${response.status}`);
    }
  },

  // H9: consulta desde cuándo contar denuncias nuevas (null si la cuenta nunca fue resuelta).
  // Resiliente como getOnlineStatus: si users no responde, devuelve null (fallback seguro =
  // contar todo el historial, mismo comportamiento que si esta función no existiera).
  async getUnderReviewResolvedAt(userId) {
    const url = `${process.env.USERS_SERVICE_URL}/internal/users/${userId}/under-review-resolved-at`;
    try {
      const response = await fetch(url, {
        headers: { 'x-internal-secret': process.env.INTERNAL_SECRET },
      });

      if (!response.ok) {
        console.warn(`[usersClient] getUnderReviewResolvedAt responded ${response.status}`);
        return null;
      }

      const data = await response.json();
      return data.underReviewResolvedAt ?? null;
    } catch (err) {
      console.warn('[usersClient] getUnderReviewResolvedAt failed, defaulting to no cutoff:', err.message);
      return null;
    }
  },
};

module.exports = { usersClient };
