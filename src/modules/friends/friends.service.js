const { friendsRepository } = require('./friends.repository');
const { AppError } = require('../../middlewares/errorHandler');

const REQUEST_LIMIT_PER_HOUR = 20;
const DEFAULT_PAGE_SIZE = 20;

const friendsService = {
  async sendRequest(requesterId, addresseeId) {
    // CA.1: no auto-solicitud
    if (requesterId === addresseeId) {
      throw new AppError(400, 'No podés enviarte una solicitud a vos mismo');
    }

    // CA.5: máximo 20 solicitudes por hora
    const recentCount = await friendsRepository.countRequestsInLastHour(requesterId);
    if (recentCount >= REQUEST_LIMIT_PER_HOUR) {
      throw new AppError(429, 'Superaste el límite de solicitudes de amistad por hora');
    }

    // CA.4: si el destinatario bloqueó al emisor, devolver éxito genérico sin crear registro
    const isBlocked = await friendsRepository.isBlockedBy(addresseeId, requesterId);
    if (isBlocked) {
      return { message: 'Solicitud enviada' };
    }

    // CA.1 + CA.3: verificar si ya existe relación en alguna dirección
    const existing = await friendsRepository.findByPair(requesterId, addresseeId);
    if (existing) {
      // CA.3: B ya había enviado solicitud a A (pendiente) — aceptar automáticamente
      if (
        existing.status === 'pending' &&
        existing.requester_id === addresseeId &&
        existing.addressee_id === requesterId
      ) {
        await friendsRepository.acceptById(existing.id);
        return { message: 'Solicitud enviada' };
      }

      // CA.1: ya son amigos o A ya envió solicitud a B
      throw new AppError(409, 'Ya existe una solicitud o amistad con este usuario');
    }

    // CA.2: crear solicitud pendiente
    await friendsRepository.create(requesterId, addresseeId);
    return { message: 'Solicitud enviada' };
  },

  // H7: listado de amigos confirmados con paginación (CA.2) y orden intercambiable (CA.1).
  // sort=recent  → ORDER BY updated_at DESC (backend).
  // sort=alphabetical → el backend devuelve en orden recent; el cliente reordena
  //   alfabéticamente después de enriquecer con nombres del servicio de usuarios.
  async listFriends(userId, { page = 1, limit = DEFAULT_PAGE_SIZE, sort = 'recent' } = {}) {
    const offset = (page - 1) * limit;

    const [friends, total] = await Promise.all([
      friendsRepository.listAccepted(userId, { limit, offset, sort }),
      friendsRepository.countAccepted(userId),
    ]);

    // CA.3: isEmpty permite al cliente mostrar diseño amigable con botón de descubrimiento
    return {
      friends: friends.map((f) => f.friend_id),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      isEmpty: total === 0,
    };
  },
};

module.exports = { friendsService };
