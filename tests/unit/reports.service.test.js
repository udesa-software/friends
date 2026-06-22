const { reportsService } = require('../../src/modules/reports/reports.service');
const { reportsRepository } = require('../../src/modules/reports/reports.repository');
const { AppError } = require('../../src/middlewares/errorHandler');
const { usersClient } = require('../../src/clients/usersClient');
const { backofficeClient } = require('../../src/clients/backofficeClient');

jest.mock('../../src/modules/reports/reports.repository', () => ({
  reportsRepository: {
    hasReportedRecently: jest.fn(),
    create: jest.fn(),
    countDistinctReporters: jest.fn(),
  },
}));
jest.mock('../../src/clients/usersClient', () => ({
  usersClient: {
    flagUserForReview: jest.fn(),
  },
}));
jest.mock('../../src/clients/backofficeClient', () => ({
  backofficeClient: {
    sendReport: jest.fn(),
  },
}));

const REPORTER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REPORTED_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REPORTER_USERNAME = 'reporter_user';
const REPORTED_USERNAME = 'reported_user';
const REASON = 'harassment';

describe('reportsService.createReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reportsRepository.hasReportedRecently.mockResolvedValue(false);
    reportsRepository.create.mockResolvedValue({
      id: 'report-1',
      reporter_id: REPORTER_ID,
      reported_id: REPORTED_ID,
      reason: REASON,
      created_at: new Date().toISOString(),
    });
    reportsRepository.countDistinctReporters.mockResolvedValue(1);
    backofficeClient.sendReport.mockResolvedValue();
    usersClient.flagUserForReview.mockResolvedValue();
  });

  // CA: no auto-denuncia
  it('lanza 400 si el usuario intenta denunciarse a sí mismo', async () => {
    await expect(
      reportsService.createReport(REPORTER_ID, REPORTER_USERNAME, REPORTER_ID, REPORTER_USERNAME, REASON)
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      reportsService.createReport(REPORTER_ID, REPORTER_USERNAME, REPORTER_ID, REPORTER_USERNAME, REASON)
    ).rejects.toBeInstanceOf(AppError);
  });

  // CA.3: throttle de 24hs
  it('lanza 409 si ya denunció a este usuario en las últimas 24hs', async () => {
    reportsRepository.hasReportedRecently.mockResolvedValue(true);
    await expect(
      reportsService.createReport(REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, REPORTED_USERNAME, REASON)
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(reportsRepository.create).not.toHaveBeenCalled();
  });

  it('crea la denuncia y devuelve el mensaje de éxito', async () => {
    const result = await reportsService.createReport(
      REPORTER_ID,
      REPORTER_USERNAME,
      REPORTED_ID,
      REPORTED_USERNAME,
      REASON
    );
    expect(reportsRepository.create).toHaveBeenCalledWith(
      REPORTER_ID,
      REPORTER_USERNAME,
      REPORTED_ID,
      REPORTED_USERNAME,
      REASON
    );
    expect(result).toEqual({ message: 'Denuncia enviada' });
  });

  it('envía una copia al backoffice de forma fire-and-forget', async () => {
    await reportsService.createReport(REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, REPORTED_USERNAME, REASON);
    expect(backofficeClient.sendReport).toHaveBeenCalledWith(
      expect.objectContaining({
        reporterId: REPORTER_ID,
        reportedId: REPORTED_ID,
        reason: REASON,
      })
    );
  });

  // CA.2: más de 5 reportes de cuentas distintas -> el 6to dispara la revisión
  it('NO marca en revisión si el conteo de denunciantes distintos es 5', async () => {
    reportsRepository.countDistinctReporters.mockResolvedValue(5);
    await reportsService.createReport(REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, REPORTED_USERNAME, REASON);
    expect(usersClient.flagUserForReview).not.toHaveBeenCalled();
  });

  it('marca al usuario en revisión cuando el conteo llega exactamente a 6', async () => {
    reportsRepository.countDistinctReporters.mockResolvedValue(6);
    await reportsService.createReport(REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, REPORTED_USERNAME, REASON);
    expect(usersClient.flagUserForReview).toHaveBeenCalledWith(REPORTED_ID);
  });

  // Usa >= en vez de === para no perder el flag en denuncias concurrentes: si dos denuncias
  // se insertan casi al mismo tiempo, ambas pueden leer un conteo que ya saltea el 6 exacto
  // (ej. 7), y con === ninguna dispararía la revisión.
  it('también marca en revisión si el conteo ya superó el umbral (ej. denuncias concurrentes que saltean el 6 exacto)', async () => {
    reportsRepository.countDistinctReporters.mockResolvedValue(7);
    await reportsService.createReport(REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, REPORTED_USERNAME, REASON);
    expect(usersClient.flagUserForReview).toHaveBeenCalledWith(REPORTED_ID);
  });
});
