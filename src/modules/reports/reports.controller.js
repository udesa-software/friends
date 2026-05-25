const { reportsService } = require('./reports.service');

const reportsController = {
  async reportUser(req, res, next) {
    try {
      const result = await reportsService.reportUser(
        req.user.sub,
        req.body.reportedId,
        req.body.reason
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};

module.exports = { reportsController };
