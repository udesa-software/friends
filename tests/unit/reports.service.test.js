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
    getUnderReviewResolvedAt: jest.fn(),
    getUserUsername: jest.fn(),
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
    usersClient.getUnderReviewResolvedAt.mockResolvedValue(null);
    usersClient.getUserUsername.mockResolvedValue('resolved_username');
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
      'resolved_username',
      REASON,
      null
    );
    expect(result).toEqual({ message: 'Denuncia enviada' });
  });

  it('envía una copia al backoffice con el username resuelto (no el del cliente)', async () => {
    await reportsService.createReport(REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, REPORTED_USERNAME, REASON);
    expect(backofficeClient.sendReport).toHaveBeenCalledWith(
      expect.objectContaining({
        reporterId: REPORTER_ID,
        reportedId: REPORTED_ID,
        reportedUsername: 'resolved_username',
        reason: REASON,
      })
    );
  });

  describe('resolución de reportedUsername desde users', () => {
    it('usa el username resuelto desde users, no el enviado por el cliente', async () => {
      usersClient.getUserUsername.mockResolvedValue('username_actual');
      await reportsService.createReport(REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, 'username_viejo', REASON);
      expect(reportsRepository.create).toHaveBeenCalledWith(
        REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, 'username_actual', REASON, null
      );
    });

    it('usa el reportedUsername del cliente como fallback cuando getUserUsername devuelve null', async () => {
      usersClient.getUserUsername.mockResolvedValue(null);
      await reportsService.createReport(REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, REPORTED_USERNAME, REASON);
      expect(reportsRepository.create).toHaveBeenCalledWith(
        REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, REPORTED_USERNAME, REASON, null
      );
    });
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

  // Reseteo del conteo tras resolver una revisión: countDistinctReporters debe recibir
  // el cutoff de usersClient.getUnderReviewResolvedAt, no contar desde siempre.
  describe('cutoff de denuncias tras resolver una revisión', () => {
    it('cuenta con since = null cuando la cuenta nunca fue resuelta', async () => {
      usersClient.getUnderReviewResolvedAt.mockResolvedValue(null);
      await reportsService.createReport(REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, REPORTED_USERNAME, REASON);
      expect(reportsRepository.countDistinctReporters).toHaveBeenCalledWith(REPORTED_ID, null);
    });

    it('propaga el timestamp de resolución a countDistinctReporters cuando existe', async () => {
      const resolvedAt = '2026-06-22T10:00:00.000Z';
      usersClient.getUnderReviewResolvedAt.mockResolvedValue(resolvedAt);
      await reportsService.createReport(REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, REPORTED_USERNAME, REASON);
      expect(reportsRepository.countDistinctReporters).toHaveBeenCalledWith(REPORTED_ID, resolvedAt);
    });

    // Caso completo del bug original: 8 denunciantes históricos pre-resolución, pero solo
    // 2 nuevos desde que se resolvió -> no debe re-flaggear (no llegó a 6 desde la resolución).
    it('NO marca en revisión si, contando solo desde la última resolución, todavía no llega a 6', async () => {
      const resolvedAt = '2026-06-22T10:00:00.000Z';
      usersClient.getUnderReviewResolvedAt.mockResolvedValue(resolvedAt);
      reportsRepository.countDistinctReporters.mockResolvedValue(2);

      await reportsService.createReport(REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, REPORTED_USERNAME, REASON);

      expect(reportsRepository.countDistinctReporters).toHaveBeenCalledWith(REPORTED_ID, resolvedAt);
      expect(usersClient.flagUserForReview).not.toHaveBeenCalled();
    });

    it('SÍ marca en revisión si, contando solo desde la última resolución, llega a 6', async () => {
      const resolvedAt = '2026-06-22T10:00:00.000Z';
      usersClient.getUnderReviewResolvedAt.mockResolvedValue(resolvedAt);
      reportsRepository.countDistinctReporters.mockResolvedValue(6);

      await reportsService.createReport(REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, REPORTED_USERNAME, REASON);

      expect(usersClient.flagUserForReview).toHaveBeenCalledWith(REPORTED_ID);
    });
  });

  describe('reasonDetail (motivo "Otro")', () => {
    it('propaga el reasonDetail saneado a reportsRepository.create cuando reason es "other"', async () => {
      await reportsService.createReport(
        REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, REPORTED_USERNAME, 'other', '  Me acosó por DM  '
      );
      expect(reportsRepository.create).toHaveBeenCalledWith(
        REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, 'resolved_username', 'other', 'Me acosó por DM'
      );
    });

    it('elimina tags HTML del reasonDetail antes de guardar', async () => {
      await reportsService.createReport(
        REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, REPORTED_USERNAME, 'other', '<script>alert(1)</script>Texto real'
      );
      expect(reportsRepository.create).toHaveBeenCalledWith(
        REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, 'resolved_username', 'other', 'alert(1)Texto real'
      );
    });

    it('propaga el reasonDetail saneado a backofficeClient.sendReport cuando reason es "other"', async () => {
      await reportsService.createReport(
        REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, REPORTED_USERNAME, 'other', 'Detalle del caso'
      );
      expect(backofficeClient.sendReport).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'other', reasonDetail: 'Detalle del caso', reportedUsername: 'resolved_username' })
      );
    });

    it('descarta el reasonDetail (guarda null) si el motivo no es "other", aunque venga informado', async () => {
      await reportsService.createReport(
        REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, REPORTED_USERNAME, 'spam', 'esto no debería guardarse'
      );
      expect(reportsRepository.create).toHaveBeenCalledWith(
        REPORTER_ID, REPORTER_USERNAME, REPORTED_ID, 'resolved_username', 'spam', null
      );
      expect(backofficeClient.sendReport).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'spam', reasonDetail: null, reportedUsername: 'resolved_username' })
      );
    });
  });
});
