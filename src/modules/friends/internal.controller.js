const { friendsRepository } = require('./friends.repository');

const internalController = {
  async getExclusions(req, res, next) {
    try {
      const excludedIds = await friendsRepository.getExcludedIds(req.params.userId);
      res.json({ excludedIds });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = { internalController };
