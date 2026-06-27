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

  async create(reporterId, reporterUsername, reportedId, reportedUsername, reason, reasonDetail = null) {
    const result = await query(
      `INSERT INTO reports (reporter_id, reporter_username, reported_id, reported_username, reason, reason_detail)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [reporterId, reporterUsername, reportedId, reportedUsername, reason, reasonDetail]
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

  // H7: listado agrupado por usuario denunciado para el panel de administración
  async listReportGroups({ page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    const result = await query(
      `SELECT
         reported_id,
         reported_username,
         COUNT(*)                    AS total_reports,
         COUNT(DISTINCT reporter_id) AS distinct_reporters,
         MAX(created_at)             AS last_reported_at,
         JSON_AGG(
           JSON_BUILD_OBJECT(
             'id',               id,
             'reporter_username', reporter_username,
             'reason',            reason,
             'reason_detail',     reason_detail,
             'reported_at',       created_at
           ) ORDER BY created_at DESC
         ) AS reports
       FROM reports
       WHERE status = 'pending'
       GROUP BY reported_id, reported_username
       ORDER BY total_reports DESC, last_reported_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  },

  // H7: total de usuarios con al menos una denuncia pendiente (para paginación)
  async countReportGroups() {
    const result = await query(
      `SELECT COUNT(DISTINCT reported_id) AS total
       FROM reports
       WHERE status = 'pending'`
    );
    return parseInt(result.rows[0].total, 10);
  },

  // H7: actualiza el status de todas las denuncias pendientes de un usuario
  async markReportsStatus(reportedId, status) {
    await query(
      `UPDATE reports
       SET status = $1
       WHERE reported_id = $2 AND status = 'pending'`,
      [status, reportedId]
    );
  },
};

module.exports = { reportsRepository };
