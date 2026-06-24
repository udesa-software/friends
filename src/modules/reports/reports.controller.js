const { reportsService } = require('./reports.service');

const reportsController = {
  async createReport(req, res, next) {
    try {
      const result = await reportsService.createReport(
        req.user.sub,
        req.user.username,
        req.body.reportedId,
        req.body.reportedUsername,
        req.body.reason,
        req.body.reasonDetail
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
};

module.exports = { reportsController };
