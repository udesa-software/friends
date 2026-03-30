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

  // H7: lista amigos confirmados; query ya validado y tipado por validateQuery(listFriendsSchema)
  async listFriends(req, res, next) {
    try {
      const { page, limit, sort } = req.query;
      const result = await friendsService.listFriends(req.user.sub, { page, limit, sort });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};

module.exports = { friendsController };
