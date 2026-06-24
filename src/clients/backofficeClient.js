// H9 CA.1: envía una copia de la denuncia al backoffice (fire-and-forget).
// friends es la fuente de verdad — si backoffice no está disponible, la denuncia
// igual queda registrada acá y el flujo de "5 denuncias -> en revisión" no se ve afectado.
const backofficeClient = {
  async sendReport({ reporterId, reporterUsername, reportedId, reportedUsername, reason, reasonDetail, createdAt }) {
    if (!process.env.BACKOFFICE_SERVICE_URL) return;

    const url = `${process.env.BACKOFFICE_SERVICE_URL}/internal/reports`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SECRET,
      },
      body: JSON.stringify({ reporterId, reporterUsername, reportedId, reportedUsername, reason, reasonDetail, createdAt }),
    });

    if (!response.ok) {
      throw new Error(`Backoffice service error: ${response.status}`);
    }
  },
};

module.exports = { backofficeClient };
