const { query } = require('../../config/database');

const reportsRepository = {
  // CA.3: verifica si ya existe un reporte del reporterId hacia reportedId en las últimas 24h
  async findRecentReport(reporterId, reportedId) {
    const result = await query(
      `SELECT id FROM reports
       WHERE reporter_id = $1
         AND reported_id = $2
         AND created_at > NOW() - INTERVAL '24 hours'`,
      [reporterId, reportedId]
    );
    return result.rows[0] ?? null;
  },

  async create(reporterId, reportedId, reason) {
    const result = await query(
      `INSERT INTO reports (reporter_id, reported_id, reason)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [reporterId, reportedId, reason]
    );
    return result.rows[0];
  },

  // CA.2: cuenta cuántas cuentas distintas han reportado a reportedId
  async countDistinctReporters(reportedId) {
    const result = await query(
      `SELECT COUNT(DISTINCT reporter_id) AS count FROM reports WHERE reported_id = $1`,
      [reportedId]
    );
    return parseInt(result.rows[0].count, 10);
  },
};

module.exports = { reportsRepository };
