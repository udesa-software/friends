const { reportsRepository } = require('./reports.repository');
const { usersClient } = require('../../clients/usersClient');
const { AppError } = require('../../middlewares/errorHandler');

const REPORT_THRESHOLD = 5;

const reportsService = {
  async reportUser(reporterId, reportedId, reason) {
    // CA.1: no auto-reporte
    if (reporterId === reportedId) {
      throw new AppError(400, 'No podés reportarte a vos mismo');
    }

    // CA.3: un mismo usuario no puede reportar a la misma persona más de una vez en 24h
    const recentReport = await reportsRepository.findRecentReport(reporterId, reportedId);
    if (recentReport) {
      throw new AppError(429, 'Ya reportaste a este usuario en las últimas 24 horas');
    }

    await reportsRepository.create(reporterId, reportedId, reason);

    // CA.2: si hay más de 5 reportes de cuentas distintas, poner al usuario en revisión
    const distinctReporters = await reportsRepository.countDistinctReporters(reportedId);
    if (distinctReporters >= REPORT_THRESHOLD) {
      // CA.4: revocar tokens inmediatamente al poner en revisión
      await usersClient.putUserUnderReview(reportedId);
    }

    return { message: 'Reporte enviado' };
  },
};

module.exports = { reportsService };
