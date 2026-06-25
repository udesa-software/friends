const { backofficeClient } = require('../../src/clients/backofficeClient');

global.fetch = jest.fn();

const REPORT = {
  reporterId: 'reporter-1',
  reporterUsername: 'reporter_user',
  reportedId: 'reported-1',
  reportedUsername: 'reported_user',
  reason: 'spam',
  createdAt: '2026-06-21T00:00:00.000Z',
};

describe('backofficeClient.sendReport', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      BACKOFFICE_SERVICE_URL: 'http://backoffice:3003',
      INTERNAL_SECRET: 'test-internal-secret',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  // CA.1: copia de la denuncia enviada al backoffice
  it('envía la denuncia al endpoint interno de backoffice con el header x-internal-secret', async () => {
    global.fetch.mockResolvedValue({ ok: true });

    await backofficeClient.sendReport(REPORT);

    expect(global.fetch).toHaveBeenCalledWith('http://backoffice:3003/internal/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': 'test-internal-secret',
      },
      body: JSON.stringify(REPORT),
    });
  });

  it('lanza un error si la respuesta no es ok', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 503 });

    await expect(backofficeClient.sendReport(REPORT)).rejects.toThrow('Backoffice service error: 503');
  });

  // Resiliencia: si BACKOFFICE_SERVICE_URL no está configurado, no debe intentar la llamada
  it('no hace ninguna petición si BACKOFFICE_SERVICE_URL no está configurado', async () => {
    delete process.env.BACKOFFICE_SERVICE_URL;

    await backofficeClient.sendReport(REPORT);

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
