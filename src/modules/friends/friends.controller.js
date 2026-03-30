const { friendsService } = require('./friends.service');

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

  // H5 CA.2 + CA.3: activar o desactivar el modo privado
  async setPrivacy(req, res, next) {
    try {
      const result = await friendsService.setPrivacy(req.user.sub, req.body.isPrivate);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // H5: obtener el estado de privacidad propio
  async getMyPrivacy(req, res, next) {
    try {
      const result = await friendsService.getMyPrivacy(req.user.sub);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // H5 CA.1: verificar si el usuario autenticado puede ver la ubicación de otro usuario
  async canSeeLocation(req, res, next) {
    try {
      const result = await friendsService.canSeeLocation(req.user.sub, req.params.userId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};

module.exports = { friendsController };
