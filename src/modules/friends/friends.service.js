const { friendsRepository } = require('./friends.repository');
const { AppError } = require('../../middlewares/errorHandler');

const REQUEST_LIMIT_PER_HOUR = 20;
const PAGE_SIZE = 20;

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

  async acceptRequest(requesterId, addresseeId) {
    // CA.1: no auto-aceptación
    if (requesterId === addresseeId) {
      throw new AppError(400, 'No podés aceptar una solicitud de vos mismo');
    }

    const existing = await friendsRepository.findByPair(requesterId, addresseeId);
    if (!existing) {
      throw new AppError(409, 'No existe una solicitud de amistad');
    }
    if (
      existing.status === 'pending' &&
      existing.requester_id === addresseeId &&
      existing.addressee_id === requesterId
    ) {
      await friendsRepository.acceptById(existing.id);
      return { message: 'Solicitud aceptada' };
    }

    if (existing.status === 'accepted') {
      throw new AppError(409, 'Ya sos amigo de esta persona');
    }

    throw new AppError(409, 'No existe una solicitud de amistad válida');
  },

  async declineRequest(requesterId, addresseeId) {
    const existing = await friendsRepository.findByPair(requesterId, addresseeId);
    if (!existing) {
      throw new AppError(409, 'No existe una solicitud de amistad');
    }

    // Verificar que la solicitud es hacia el usuario actual (requesterId es el addressee)
    if (
      existing.status === 'pending' &&
      existing.requester_id === addresseeId &&
      existing.addressee_id === requesterId
    ) {
      // CA.2: eliminación lógica, sin notificar al emisor
      await friendsRepository.softDeleteById(existing.id);
      return { message: 'Solicitud rechazada' };
    }

    if (existing.status === 'accepted') {
      throw new AppError(409, 'No puedes rechazar a alguien que ya es tu amigo');
    }

    throw new AppError(409, 'No existe una solicitud de amistad válida para rechazar');
  },

  // CA.3/CA.5: lista paginada de solicitudes pendientes ordenadas descendente.
  // CA.4 (filtrar emisores con cuenta eliminada/suspendida) no está implementado:
  // requiere un endpoint en el servicio de usuarios que aún no existe.
  async getPendingRequests(addresseeId, page = 1) {
    const limit = PAGE_SIZE;
    const offset = (page - 1) * limit;

    const requesterIds = await friendsRepository.getPendingRequesterIds(addresseeId);

    if (requesterIds.length === 0) {
      return {
        data: [],
        pagination: { page, pageSize: limit, total: 0, totalPages: 0 },
      };
    }

    // CA.3/CA.5: paginar resultados ordenados por created_at DESC
    const { rows, total } = await friendsRepository.getPendingRequests(
      addresseeId,
      requesterIds,
      limit,
      offset
    );

    return {
      data: rows,
      pagination: {
        page,
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },
};

module.exports = { friendsService };
