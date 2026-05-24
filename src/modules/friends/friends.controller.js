const { friendsService } = require('./friends.service');

const friendsController = {
  async sendRequest(req, res, next) {
    try {
      // req.user.sub y req.user.username vienen del JWT verificado por authenticate
      const result = await friendsService.sendRequest(
        req.user.sub,
        req.user.username,
        req.body.addresseeId
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async removeFriend(req, res, next) {
    try {
      const result = await friendsService.removeFriend(req.user.sub, req.params.friendId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
      
  async acceptRequest(req, res, next) {
    try {
      const result = await friendsService.acceptRequest(
        req.user.sub,
        req.user.username,
        req.body.requesterId
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async declineRequest(req, res, next) {
    try {
      const result = await friendsService.declineRequest(req.user.sub, req.body.requesterId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async getPendingRequests(req, res, next) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const result = await friendsService.getPendingRequests(req.user.sub, page);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // H7: lista de amigos confirmados, paginada y ordenada.
  // sortBy: 'alphabetical' (default) | 'proximity' (501 hasta integrar ubicaciones)
  async getFriendsList(req, res, next) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const sortBy = req.query.sortBy || 'alphabetical';
      const result = await friendsService.getFriendsList(req.user.sub, sortBy, page);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
  // H5-friends: endpoint interno llamado por location service para obtener friend IDs.
  async getFriendIds(req, res, next) {
    try {
      const result = await friendsService.getFriendIds(req.params.userId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // H4: llamado por el microservicio users al eliminar una cuenta.
  // Elimina lógicamente todas las relaciones del usuario (accepted + pending, ambas direcciones).
  async deleteUserRelationships(req, res, next) {
    try {
      const result = await friendsService.deleteUserRelationships(req.params.userId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // H8: bloquea a un usuario. CA.1: sin notificación al bloqueado.
  async blockUser(req, res, next) {
    try {
      const result = await friendsService.blockUser(
        req.user.sub,
        req.body.blockedId,
        req.body.blockedUsername
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // H8 CA.2: desbloquea a un usuario.
  async unblockUser(req, res, next) {
    try {
      const result = await friendsService.unblockUser(req.user.sub, req.params.blockedId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // H8 CA.2: lista de usuarios bloqueados.
  async getBlockedUsers(req, res, next) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const result = await friendsService.getBlockedUsers(req.user.sub, page);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // Devuelve el estado de la relación entre el usuario autenticado y otro usuario
  async getRelationshipStatus(req, res, next) {
    try {
      const result = await friendsService.getRelationshipStatus(req.user.sub, req.params.userId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};

module.exports = { friendsController };
