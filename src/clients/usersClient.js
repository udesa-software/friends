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

  // H9 CA.2/CA.4: pone al usuario reportado en estado "En revisión" y revoca sus tokens.
  // Si el usuario ya está en revisión, el users service responde con 200 sin efecto.
  async putUserUnderReview(userId) {
    const url = `${process.env.USERS_SERVICE_URL}/internal/users/${userId}/under-review`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Users service error putting user under review: ${response.status}`);
    }
  },
};

module.exports = { usersClient };
