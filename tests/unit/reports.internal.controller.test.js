const { reportsInternalController } = require('../../src/modules/reports/reports.internal.controller');
const { reportsRepository } = require('../../src/modules/reports/reports.repository');

jest.mock('../../src/modules/reports/reports.repository', () => ({
  reportsRepository: {
    listReportGroups:  jest.fn(),
    countReportGroups: jest.fn(),
    markReportsStatus: jest.fn(),
  },
}));

const REPORTED_ID = 'reported-uuid-1';

const SAMPLE_GROUP = {
  reported_id:        REPORTED_ID,
  reported_username:  'usuario_denunciado',
  total_reports:      3,
  distinct_reporters: 3,
  last_reported_at:   '2026-06-25T10:00:00.000Z',
  reports: [
    { id: 'rep-1', reporter_username: 'user1', reason: 'spam', reason_detail: null, reported_at: '2026-06-25T10:00:00.000Z' },
  ],
};

function makeReq(overrides = {}) {
  return { params: { reportedId: REPORTED_ID }, query: {}, ...overrides };
}
function makeRes() { return { json: jest.fn() }; }
function makeNext() { return jest.fn(); }

// ─── list ─────────────────────────────────────────────────────────────────────

describe('reportsInternalController.list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reportsRepository.listReportGroups.mockResolvedValue([SAMPLE_GROUP]);
    reportsRepository.countReportGroups.mockResolvedValue(1);
  });

  it('devuelve groups, total, page y limit en la respuesta', async () => {
    const res = makeRes();
    await reportsInternalController.list(makeReq(), res, makeNext());

    expect(res.json).toHaveBeenCalledWith({
      groups: [SAMPLE_GROUP],
      total:  1,
      page:   1,
      limit:  20,
    });
  });

  it('llama a listReportGroups con page y limit parseados desde query string', async () => {
    await reportsInternalController.list(makeReq({ query: { page: '2', limit: '10' } }), makeRes(), makeNext());

    expect(reportsRepository.listReportGroups).toHaveBeenCalledWith({ page: 2, limit: 10 });
  });

  it('usa page=1 y limit=20 por defecto si no se pasan query params', async () => {
    await reportsInternalController.list(makeReq({ query: {} }), makeRes(), makeNext());

    expect(reportsRepository.listReportGroups).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('llama a countReportGroups para obtener el total de grupos', async () => {
    await reportsInternalController.list(makeReq(), makeRes(), makeNext());
    expect(reportsRepository.countReportGroups).toHaveBeenCalled();
  });

  it('llama a next con el error si el repository falla', async () => {
    reportsRepository.listReportGroups.mockRejectedValue(new Error('DB error'));
    const next = makeNext();
    await reportsInternalController.list(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ─── discard ──────────────────────────────────────────────────────────────────

describe('reportsInternalController.discard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reportsRepository.markReportsStatus.mockResolvedValue();
  });

  it('llama a markReportsStatus con "discarded"', async () => {
    await reportsInternalController.discard(makeReq(), makeRes(), makeNext());
    expect(reportsRepository.markReportsStatus).toHaveBeenCalledWith(REPORTED_ID, 'discarded');
  });

  it('devuelve un mensaje de confirmación', async () => {
    const res = makeRes();
    await reportsInternalController.discard(makeReq(), res, makeNext());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
  });

  it('llama a next con el error si markReportsStatus falla', async () => {
    reportsRepository.markReportsStatus.mockRejectedValue(new Error('DB error'));
    const next = makeNext();
    await reportsInternalController.discard(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ─── resolve ──────────────────────────────────────────────────────────────────

describe('reportsInternalController.resolve', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reportsRepository.markReportsStatus.mockResolvedValue();
  });

  it('llama a markReportsStatus con "resolved"', async () => {
    await reportsInternalController.resolve(makeReq(), makeRes(), makeNext());
    expect(reportsRepository.markReportsStatus).toHaveBeenCalledWith(REPORTED_ID, 'resolved');
  });

  it('devuelve un mensaje de confirmación', async () => {
    const res = makeRes();
    await reportsInternalController.resolve(makeReq(), res, makeNext());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
  });

  it('llama a next con el error si markReportsStatus falla', async () => {
    reportsRepository.markReportsStatus.mockRejectedValue(new Error('DB error'));
    const next = makeNext();
    await reportsInternalController.resolve(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
