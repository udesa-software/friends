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
};

module.exports = { friendsController };
