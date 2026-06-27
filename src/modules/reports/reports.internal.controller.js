const { reportsRepository } = require('./reports.repository');

const reportsInternalController = {
  // H7 CA.1: listado agrupado por usuario denunciado, ordenado por severidad
  async list(req, res, next) {
    try {
      const page  = Math.max(1, parseInt(req.query.page  ?? '1',  10));
      const limit = Math.max(1, parseInt(req.query.limit ?? '20', 10));

      const [groups, total] = await Promise.all([
        reportsRepository.listReportGroups({ page, limit }),
        reportsRepository.countReportGroups(),
      ]);

      res.json({ groups, total, page, limit });
    } catch (err) {
      next(err);
    }
  },

  // H7 CA.2/CA.3: descartar — marca reportes como 'discarded'
  async discard(req, res, next) {
    try {
      const { reportedId } = req.params;
      await reportsRepository.markReportsStatus(reportedId, 'discarded');
      res.json({ message: 'Denuncias descartadas.' });
    } catch (err) {
      next(err);
    }
  },

  // H7 CA.2: resolver — marca reportes como 'resolved'
  async resolve(req, res, next) {
    try {
      const { reportedId } = req.params;
      await reportsRepository.markReportsStatus(reportedId, 'resolved');
      res.json({ message: 'Caso resuelto.' });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = { reportsInternalController };
