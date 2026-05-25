const { reportsService } = require('../../src/modules/reports/reports.service');
const { reportsRepository } = require('../../src/modules/reports/reports.repository');
const { usersClient } = require('../../src/clients/usersClient');
const { AppError } = require('../../src/middlewares/errorHandler');

jest.mock('../../src/modules/reports/reports.repository', () => ({
  reportsRepository: {
    findRecentReport: jest.fn(),
    create: jest.fn(),
    countDistinctReporters: jest.fn(),
  },
}));

jest.mock('../../src/clients/usersClient', () => ({
  usersClient: {
    putUserUnderReview: jest.fn(),
  },
}));

const REPORTER_ID  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REPORTED_ID  = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REASON       = 'acoso';

// ---------------------------------------------------------------------------
// reportsService.reportUser
// ---------------------------------------------------------------------------
describe('reportsService.reportUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reportsRepository.findRecentReport.mockResolvedValue(null);
    reportsRepository.create.mockResolvedValue({ id: 'rep-id', reporter_id: REPORTER_ID, reported_id: REPORTED_ID, reason: REASON });
    reportsRepository.countDistinctReporters.mockResolvedValue(1);
    usersClient.putUserUnderReview.mockResolvedValue();
  });

  // CA.1: no auto-reporte
  it('CA.1: lanza 400 si el usuario intenta reportarse a sí mismo', async () => {
    await expect(reportsService.reportUser(REPORTER_ID, REPORTER_ID, REASON))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('CA.1: lanza AppError al intentar auto-reportarse', async () => {
    await expect(reportsService.reportUser(REPORTER_ID, REPORTER_ID, REASON))
      .rejects.toBeInstanceOf(AppError);
  });

  it('CA.1: no llama al repositorio si reporterId === reportedId', async () => {
    await reportsService.reportUser(REPORTER_ID, REPORTER_ID, REASON).catch(() => {});
    expect(reportsRepository.findRecentReport).not.toHaveBeenCalled();
    expect(reportsRepository.create).not.toHaveBeenCalled();
  });

  // CA.3: límite de 24 horas
  it('CA.3: lanza 429 si ya existe un reporte del mismo usuario en las últimas 24h', async () => {
    reportsRepository.findRecentReport.mockResolvedValue({ id: 'existing-report' });

    await expect(reportsService.reportUser(REPORTER_ID, REPORTED_ID, REASON))
      .rejects.toMatchObject({ statusCode: 429 });
  });

  it('CA.3: lanza AppError si ya existe un reporte reciente', async () => {
    reportsRepository.findRecentReport.mockResolvedValue({ id: 'existing-report' });

    await expect(reportsService.reportUser(REPORTER_ID, REPORTED_ID, REASON))
      .rejects.toBeInstanceOf(AppError);
  });

  it('CA.3: no crea el reporte si ya reportó en las últimas 24h', async () => {
    reportsRepository.findRecentReport.mockResolvedValue({ id: 'existing-report' });

    await reportsService.reportUser(REPORTER_ID, REPORTED_ID, REASON).catch(() => {});

    expect(reportsRepository.create).not.toHaveBeenCalled();
  });

  it('CA.3: verifica el reporte reciente con el par correcto (reporterId, reportedId)', async () => {
    await reportsService.reportUser(REPORTER_ID, REPORTED_ID, REASON);

    expect(reportsRepository.findRecentReport).toHaveBeenCalledWith(REPORTER_ID, REPORTED_ID);
  });

  // Caso feliz: inserta el reporte
  it('crea el reporte con reporterId, reportedId y reason correctos', async () => {
    await reportsService.reportUser(REPORTER_ID, REPORTED_ID, REASON);

    expect(reportsRepository.create).toHaveBeenCalledWith(REPORTER_ID, REPORTED_ID, REASON);
  });

  it('devuelve mensaje de éxito al reportar correctamente', async () => {
    const result = await reportsService.reportUser(REPORTER_ID, REPORTED_ID, REASON);

    expect(result).toEqual({ message: 'Reporte enviado' });
  });

  // CA.2: conteo de reportes distintos — por debajo del umbral
  it('CA.2: consulta countDistinctReporters después de crear el reporte', async () => {
    await reportsService.reportUser(REPORTER_ID, REPORTED_ID, REASON);

    expect(reportsRepository.countDistinctReporters).toHaveBeenCalledWith(REPORTED_ID);
  });

  it('CA.2: no llama a putUserUnderReview si hay menos de 5 reportantes distintos', async () => {
    reportsRepository.countDistinctReporters.mockResolvedValue(4);

    await reportsService.reportUser(REPORTER_ID, REPORTED_ID, REASON);

    expect(usersClient.putUserUnderReview).not.toHaveBeenCalled();
  });

  it('CA.2: no llama a putUserUnderReview con exactamente 4 reportantes', async () => {
    reportsRepository.countDistinctReporters.mockResolvedValue(4);

    await reportsService.reportUser(REPORTER_ID, REPORTED_ID, REASON);

    expect(usersClient.putUserUnderReview).not.toHaveBeenCalled();
  });

  // CA.2/CA.4: umbral de 5 reportes alcanzado
  it('CA.2/CA.4: llama a putUserUnderReview cuando se alcanzan exactamente 5 reportantes distintos', async () => {
    reportsRepository.countDistinctReporters.mockResolvedValue(5);

    await reportsService.reportUser(REPORTER_ID, REPORTED_ID, REASON);

    expect(usersClient.putUserUnderReview).toHaveBeenCalledWith(REPORTED_ID);
  });

  it('CA.2/CA.4: llama a putUserUnderReview cuando hay más de 5 reportantes distintos', async () => {
    reportsRepository.countDistinctReporters.mockResolvedValue(10);

    await reportsService.reportUser(REPORTER_ID, REPORTED_ID, REASON);

    expect(usersClient.putUserUnderReview).toHaveBeenCalledWith(REPORTED_ID);
  });

  it('CA.4: llama a putUserUnderReview con el ID del usuario reportado (no del reportador)', async () => {
    reportsRepository.countDistinctReporters.mockResolvedValue(5);

    await reportsService.reportUser(REPORTER_ID, REPORTED_ID, REASON);

    expect(usersClient.putUserUnderReview).toHaveBeenCalledWith(REPORTED_ID);
    expect(usersClient.putUserUnderReview).not.toHaveBeenCalledWith(REPORTER_ID);
  });

  // Orden: create antes de countDistinctReporters antes de putUserUnderReview
  it('CA.4: el orden de operaciones es create → count → putUserUnderReview', async () => {
    const callOrder = [];
    reportsRepository.countDistinctReporters.mockResolvedValue(5);
    reportsRepository.create.mockImplementation(() => {
      callOrder.push('create');
      return Promise.resolve({ id: 'rep-id' });
    });
    reportsRepository.countDistinctReporters.mockImplementation(() => {
      callOrder.push('count');
      return Promise.resolve(5);
    });
    usersClient.putUserUnderReview.mockImplementation(() => {
      callOrder.push('putUnderReview');
      return Promise.resolve();
    });

    await reportsService.reportUser(REPORTER_ID, REPORTED_ID, REASON);

    expect(callOrder).toEqual(['create', 'count', 'putUnderReview']);
  });

  // putUserUnderReview es idempotente en el servicio (si el cliente falla, debe propagarse)
  it('CA.4: si putUserUnderReview falla, el error se propaga', async () => {
    reportsRepository.countDistinctReporters.mockResolvedValue(5);
    usersClient.putUserUnderReview.mockRejectedValue(new Error('Users service down'));

    await expect(reportsService.reportUser(REPORTER_ID, REPORTED_ID, REASON))
      .rejects.toThrow('Users service down');
  });

  // El reporte se persiste aunque aún no se supere el umbral
  it('el reporte se crea aunque el conteo esté por debajo del umbral', async () => {
    reportsRepository.countDistinctReporters.mockResolvedValue(2);

    await reportsService.reportUser(REPORTER_ID, REPORTED_ID, REASON);

    expect(reportsRepository.create).toHaveBeenCalledTimes(1);
  });
});
