const { friendsRepository } = require('./friends.repository');
const { AppError } = require('../../middlewares/errorHandler');
const { notificationsClient } = require('../../clients/notificationsClient');
const { usersClient } = require('../../clients/usersClient');
const { logger } = require('../../observability/logger');

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
      logger.warn({ event: 'friend.rate_limit_hit', requesterId, count: recentCount }, 'friend.rate_limit_hit');
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

    logger.info({ event: 'friend.request_sent', requesterId, addresseeId }, 'friend.request_sent');

    // Enviar notificación push asincrónica (no bloqueante)
    notificationsClient.sendNotification(addresseeId, {
      title: '¡Nueva solicitud de amistad!',
      body: `${requesterUsername} te ha enviado una solicitud de amistad.`,
      data: { screen: 'PendingRequests' }
    }).catch(err => logger.error({ err: err.message, event: 'friend.notification_failed' }, 'friend.notification_failed'));

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
      throw new AppError(410, 'No se encontró una amistad con este usuario');
    }

    // CA.3: eliminar registro (un solo registro cubre ambas direcciones)
    await friendsRepository.removeByPair(requesterId, friendId);

    logger.info({ event: 'friend.removed', userId: requesterId, friendId }, 'friend.removed');

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

      logger.info({ event: 'friend.request_accepted', userId: requesterId, friendId: addresseeId }, 'friend.request_accepted');

      // Enviar notificación push asincrónica (no bloqueante) al emisor original (addresseeId)
      notificationsClient.sendNotification(addresseeId, {
        title: '¡Solicitud de amistad aceptada!',
        body: `${requesterUsername} aceptó tu solicitud de amistad.`,
        data: {
          screen: 'MapFocus',
          friendId: requesterId,
          friendUsername: requesterUsername
        }
      }).catch(err => logger.error({ err: err.message, event: 'friend.notification_failed' }, 'friend.notification_failed'));

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

  async cancelRequest(requesterId, addresseeId) {
    const existing = await friendsRepository.findByPair(requesterId, addresseeId);
    if (!existing) {
      throw new AppError(409, 'No existe una solicitud de amistad');
    }

    // Verificar que la solicitud fue enviada por el usuario actual
    if (
      existing.status === 'pending' &&
      existing.requester_id === requesterId &&
      existing.addressee_id === addresseeId
    ) {
      await friendsRepository.softDeleteById(existing.id);
      return { message: 'Solicitud cancelada' };
    }

    throw new AppError(409, 'No existe una solicitud de amistad válida para cancelar');
  },

  // H7 CA.1: lista paginada de amigos confirmados.
  // sortBy='alphabetical': ordena por username del amigo (A-Z).
  // sortBy='proximity': devuelve 501 — requiere integración con servicio de ubicaciones (pendiente).
  // H10 CA.1/CA.2: enriquece cada amigo con is_online (true si estuvo activo en los últimos 5 min).
  async getFriendsList(userId, sortBy = 'alphabetical', page = 1) {
    if (sortBy === 'proximity') {
      throw new AppError(501, 'Ordenamiento por cercanía aún no está disponible');
    }

    const limit = PAGE_SIZE;
    const offset = (page - 1) * limit;

    const { rows, total } = await friendsRepository.getConfirmedFriends(userId, limit, offset);

    // H10 CA.1: consultar online-status y fotos de perfil para los amigos de esta página.
    // Si USERS_SERVICE_URL no está configurado (entorno sin inter-servicios), se salta.
    let onlineSet = new Set();
    let photoMap = new Map();
    if (process.env.USERS_SERVICE_URL && rows.length > 0) {
      const friendIds = rows.map((r) => r.friend_id);
      const [profiles] = await Promise.all([
        usersClient.getBatchProfiles(friendIds),
        usersClient.getOnlineStatus(friendIds).then((s) => { onlineSet = s; }),
      ]);
      photoMap = new Map(profiles.map((p) => [p.id, p.profile_photo_url]));
    }

    const enrichedRows = rows.map((r) => ({
      ...r,
      is_online: onlineSet.has(r.friend_id),
      profile_photo_url: photoMap.get(r.friend_id) ?? null,
    }));

    return {
      data: enrichedRows,
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
  // H5-friends: endpoint interno usado por location para obtener IDs de amigos confirmados.
  async getFriendIds(userId) {
    const friendIds = await friendsRepository.getConfirmedFriendIds(userId);
    return { friendIds };
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

    logger.info({ event: 'friend.user_blocked', blockerId, blockedId }, 'friend.user_blocked');

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
  // Devuelve el estado de la relación entre userId y targetId:
  //   'self'             → mismo usuario
  //   'friends'          → amistad aceptada
  //   'pending_sent'     → userId envió solicitud pendiente a targetId
  //   'pending_received' → targetId envió solicitud pendiente a userId
  //   'none'             → sin relación
  async getRelationshipStatus(userId, targetId) {
    if (userId === targetId) return { status: 'self' };
    
    // Check if I blocked the user
    const isBlocked = await friendsRepository.isBlockedBy(userId, targetId);
    if (isBlocked) return { status: 'blocked' };

    const row = await friendsRepository.findByPair(userId, targetId);
    if (!row) return { status: 'none' };
    if (row.status === 'accepted') return { status: 'friends' };
    if (row.status === 'pending') {
      if (row.requester_id === userId) return { status: 'pending_sent' };
      return { status: 'pending_received' };
    }
    return { status: 'none' };
  },

  async getRelationshipStatuses(userId, targetIds) {
    if (!targetIds || targetIds.length === 0) return {};

    // 1. Obtener todos los bloqueos (isBlockedBy)
    const blocks = await friendsRepository.getBlocksByBlocker(userId, targetIds);
    const blockedSet = new Set(blocks.map(b => b.blocked_id));

    // 2. Obtener todas las relaciones
    const rows = await friendsRepository.findByPairs(userId, targetIds);
    const relationMap = {};
    for (const row of rows) {
      const otherId = row.requester_id === userId ? row.addressee_id : row.requester_id;
      relationMap[otherId] = row;
    }

    const result = {};
    for (const targetId of targetIds) {
      if (userId === targetId) {
        result[targetId] = 'self';
        continue;
      }
      if (blockedSet.has(targetId)) {
        result[targetId] = 'blocked';
        continue;
      }
      const row = relationMap[targetId];
      if (!row) {
        result[targetId] = 'none';
        continue;
      }
      if (row.status === 'accepted') {
        result[targetId] = 'friends';
      } else if (row.status === 'pending') {
        if (row.requester_id === userId) result[targetId] = 'pending_sent';
        else result[targetId] = 'pending_received';
      } else {
        result[targetId] = 'none';
      }
    }
    return result;
  },

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
