const { friendsRepository } = require('./friends.repository');
const { AppError } = require('../../middlewares/errorHandler');

const REQUEST_LIMIT_PER_HOUR = 20;

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

  // H5 CA.2 + CA.3: activar o desactivar el modo privado con efecto inmediato
  async setPrivacy(userId, isPrivate) {
    await friendsRepository.setPrivacy(userId, isPrivate);
    return {
      isPrivate,
      message: isPrivate ? 'Modo privado activado' : 'Modo privado desactivado',
    };
  },

  // H5: obtener el estado de privacidad propio
  async getMyPrivacy(userId) {
    const row = await friendsRepository.getPrivacy(userId);
    return { isPrivate: row.is_private };
  },

  // H5 CA.1: verificar si el requester puede ver la ubicación del targetUserId.
  // Si el target tiene el modo privado activo, solo sus amigos pueden verla.
  async canSeeLocation(requesterId, targetUserId) {
    if (requesterId === targetUserId) {
      return { canSeeLocation: true };
    }

    const { is_private } = await friendsRepository.getPrivacy(targetUserId);
    if (!is_private) {
      return { canSeeLocation: true };
    }

    const friends = await friendsRepository.areFriends(requesterId, targetUserId);
    return { canSeeLocation: friends };
  },
};

module.exports = { friendsService };
