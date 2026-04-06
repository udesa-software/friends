const { friendsService } = require('./friends.service');
const { AppError } = require('../../middlewares/errorHandler');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const friendsController = {
  async sendRequest(req, res, next) {
    try {
      // req.user.sub viene del JWT verificado por el middleware authenticate
      const result = await friendsService.sendRequest(req.user.sub, req.body.addresseeId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async acceptRequest(req, res, next) {
    try {
      const result = await friendsService.acceptRequest(req.user.sub, req.body.requesterId);
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

  async blockUser(req, res, next) {
    try {
      const result = await friendsService.blockUser(req.user.sub, req.body.blockedId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async unblockUser(req, res, next) {
    try {
      if (!UUID_REGEX.test(req.params.blockedId)) {
        throw new AppError(400, 'El ID del usuario no es válido');
      }
      const result = await friendsService.unblockUser(req.user.sub, req.params.blockedId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  async getBlockedUsers(req, res, next) {
    try {
      const result = await friendsService.getBlockedUsers(req.user.sub);
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
};

module.exports = { friendsController };
