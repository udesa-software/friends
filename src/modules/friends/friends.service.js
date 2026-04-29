const { friendsRepository } = require('./friends.repository');
const { AppError } = require('../../middlewares/errorHandler');

const REQUEST_LIMIT_PER_HOUR = 20;
const PAGE_SIZE = 20;

const friendsService = {
  // requesterUsername: username del usuario actual (del JWT), se persiste en la fila.
  async sendRequest(requesterId, requesterUsername, addresseeId) {
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
      // CA.3: B ya había enviado solicitud a A (pendiente) — aceptar automáticamente.
      // El usuario actual (requesterId) es el addressee de la fila existente,
      // así que su username va en addressee_username.
      if (
        existing.status === 'pending' &&
        existing.requester_id === addresseeId &&
        existing.addressee_id === requesterId
      ) {
        await friendsRepository.acceptById(existing.id, requesterUsername);
        return { message: 'Solicitud enviada' };
      }

      // CA.1: ya son amigos o A ya envió solicitud a B
      throw new AppError(409, 'Ya existe una solicitud o amistad con este usuario');
    }

    // CA.2: crear solicitud pendiente
    await friendsRepository.create(requesterId, requesterUsername, addresseeId);
    return { message: 'Solicitud enviada' };
  },

  async removeFriend(requesterId, friendId) {
    // No auto-eliminación
    if (requesterId === friendId) {
      throw new AppError(400, 'No podés eliminarte a vos mismo como amigo');
    }

    // Verificar que la amistad existe y está aceptada
    const friendship = await friendsRepository.findByPair(requesterId, friendId);
    if (!friendship || friendship.status !== 'accepted') {
      throw new AppError(404, 'No se encontró una amistad con este usuario');
    }

    // CA.3: eliminar registro (un solo registro cubre ambas direcciones)
    await friendsRepository.removeByPair(requesterId, friendId);

    return { message: 'Amistad eliminada' };
  },

  // requesterUsername: username del usuario actual (el aceptante, addressee de la fila).
  async acceptRequest(requesterId, requesterUsername, addresseeId) {
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
      await friendsRepository.acceptById(existing.id, requesterUsername);
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

  // H7 CA.1: lista paginada de amigos confirmados.
  // sortBy='alphabetical': ordena por username del amigo (A-Z).
  // sortBy='proximity': devuelve 501 — requiere integración con servicio de ubicaciones (pendiente).
  async getFriendsList(userId, sortBy = 'alphabetical', page = 1) {
    if (sortBy === 'proximity') {
      throw new AppError(501, 'Ordenamiento por cercanía aún no está disponible');
    }

    const limit = PAGE_SIZE;
    const offset = (page - 1) * limit;

    const { rows, total } = await friendsRepository.getConfirmedFriends(userId, limit, offset);

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
  // H4 CA.2/CA.4: elimina lógicamente todas las relaciones de amistad del usuario,
  // tanto las aceptadas como las solicitudes pendientes (en ambas direcciones).
  async deleteUserRelationships(userId) {
    const count = await friendsRepository.softDeleteAllByUserId(userId);
    return { deleted: count };
  },

  // H8: bloquea a un usuario.
  // CA.1: el bloqueado no recibe notificación (no se envía ninguna).
  // CA.3: si existe amistad o solicitud pendiente, se elimina automáticamente.
  async blockUser(blockerId, blockedId, blockedUsername) {
    if (blockerId === blockedId) {
      throw new AppError(400, 'No podés bloquearte a vos mismo');
    }

    const alreadyBlocked = await friendsRepository.isBlockedBy(blockerId, blockedId);
    if (alreadyBlocked) {
      throw new AppError(409, 'Este usuario ya está bloqueado');
    }

    // CA.3: romper amistad o solicitud pendiente si existe
    const friendship = await friendsRepository.findByPair(blockerId, blockedId);
    if (friendship) {
      await friendsRepository.removeByPair(blockerId, blockedId);
    }

    await friendsRepository.createBlock(blockerId, blockedId, blockedUsername);

    return { message: 'Usuario bloqueado', blockedUsername };
  },

  // H8 CA.2: desbloquea a un usuario.
  async unblockUser(blockerId, blockedId) {
    if (blockerId === blockedId) {
      throw new AppError(400, 'No podés desbloquearte a vos mismo');
    }

    const removed = await friendsRepository.removeBlock(blockerId, blockedId);
    if (!removed) {
      throw new AppError(404, 'No tenés bloqueado a este usuario');
    }

    return { message: 'Usuario desbloqueado' };
  },

  // H8 CA.2: lista paginada de usuarios bloqueados.
  async getBlockedUsers(blockerId, page = 1) {
    const limit = PAGE_SIZE;
    const offset = (page - 1) * limit;

    const { rows, total } = await friendsRepository.getBlockedUsers(blockerId, limit, offset);

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
