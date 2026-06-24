const { reportsRepository } = require('./reports.repository');
const { AppError } = require('../../middlewares/errorHandler');
const { usersClient } = require('../../clients/usersClient');
const { backofficeClient } = require('../../clients/backofficeClient');
const { logger } = require('../../observability/logger');

// CA.2: "más de 5 reportes de cuentas distintas" -> a partir del 6to denunciante distinto se
// dispara la revisión. Usa >= en vez de === porque dos denuncias concurrentes pueden insertar
// sus filas antes de que cualquiera de las dos lea el conteo, haciendo que ambas lean un valor
// que ya saltea el 6 exacto (ej. 7) — con === ninguna dispararía el flag. >= también re-flaggea
// correctamente a una cuenta que fue resuelta y vuelve a acumular denuncias.
const REVIEW_THRESHOLD = 6;

const reportsService = {
  async createReport(reporterId, reporterUsername, reportedId, reportedUsername, reason, reasonDetail) {
    if (reporterId === reportedId) {
      throw new AppError(400, 'No podés denunciarte a vos mismo');
    }

    // CA.3: no permitir denunciar al mismo usuario más de una vez en 24hs
    const alreadyReported = await reportsRepository.hasReportedRecently(reporterId, reportedId);
    if (alreadyReported) {
      throw new AppError(409, 'Ya reportaste a este usuario, podés volver a hacerlo en 24 horas');
    }

    // Solo conservamos el detalle libre cuando el motivo es 'other' — defensa en profundidad:
    // si llega reasonDetail con cualquier otro motivo, se descarta. Sanitiza igual que
    // userService.updateProfile sanea biography (elimina tags HTML).
    const sanitizedDetail =
      reason === 'other' && reasonDetail
        ? reasonDetail.replace(/<[^>]*>/g, '').trim()
        : null;

    const report = await reportsRepository.create(
      reporterId,
      reporterUsername,
      reportedId,
      reportedUsername,
      reason,
      sanitizedDetail
    );

    logger.info({ event: 'report.created', reporterId, reportedId, reason }, 'report.created');

    // CA.1: enviar copia al backoffice (fire-and-forget, no bloquea la respuesta)
    backofficeClient
      .sendReport({
        reporterId,
        reporterUsername,
        reportedId,
        reportedUsername,
        reason,
        reasonDetail: sanitizedDetail,
        createdAt: report.created_at,
      })
      .catch((err) =>
        logger.error({ err: err.message, event: 'report.backoffice_sync_failed' }, 'report.backoffice_sync_failed')
      );

    // CA.2/CA.4: si este reporte cruza el umbral, marcar la cuenta en revisión en users.
    // Solo cuenta denuncias posteriores a la última resolución de un admin (si la hubo) —
    // si no, una cuenta ya resuelta se re-flaggearía con una sola denuncia nueva en vez de
    // necesitar 6 nuevas. Llamada síncrona (no fire-and-forget) porque decide si se cuenta.
    const resolvedAt = await usersClient.getUnderReviewResolvedAt(reportedId);
    const distinctReporters = await reportsRepository.countDistinctReporters(reportedId, resolvedAt);
    if (distinctReporters >= REVIEW_THRESHOLD) {
      usersClient.flagUserForReview(reportedId).catch((err) =>
        logger.error({ err: err.message, event: 'report.flag_review_failed', reportedId }, 'report.flag_review_failed')
      );
    }

    return { message: 'Denuncia enviada' };
  },
};

module.exports = { reportsService };
