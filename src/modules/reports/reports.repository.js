const { query } = require('../../config/database');

const reportsRepository = {
  // CA.3: existe una denuncia de este par en las últimas 24 horas
  async hasReportedRecently(reporterId, reportedId) {
    const result = await query(
      `SELECT id FROM reports
       WHERE reporter_id = $1 AND reported_id = $2
         AND created_at > NOW() - INTERVAL '24 hours'`,
      [reporterId, reportedId]
    );
    return result.rows.length > 0;
  },

  async create(reporterId, reporterUsername, reportedId, reportedUsername, reason) {
    const result = await query(
      `INSERT INTO reports (reporter_id, reporter_username, reported_id, reported_username, reason)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [reporterId, reporterUsername, reportedId, reportedUsername, reason]
    );
    return result.rows[0];
  },

  // CA.2: cuenta denunciantes distintos (no el total de filas) — un mismo
  // reporter puede volver a denunciar después de las 24hs y no debe contar dos veces.
  // since: si se pasa, solo cuenta denuncias posteriores a esa fecha (denuncias previas
  // a la última resolución de un admin no deben volver a sumar para el umbral).
  async countDistinctReporters(reportedId, since = null) {
    const result = await query(
      `SELECT COUNT(DISTINCT reporter_id) as count FROM reports
       WHERE reported_id = $1 AND ($2::timestamptz IS NULL OR created_at > $2)`,
      [reportedId, since]
    );
    return parseInt(result.rows[0].count, 10);
  },
};

module.exports = { reportsRepository };
