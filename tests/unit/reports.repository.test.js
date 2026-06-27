const { reportsRepository } = require('../../src/modules/reports/reports.repository');
const { query } = require('../../src/config/database');

jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
}));

const REPORTED_ID = 'reported-uuid-1';

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── listReportGroups ─────────────────────────────────────────────────────────

describe('reportsRepository.listReportGroups', () => {
  it('ejecuta la query con LIMIT y OFFSET correctos para page=1, limit=20', async () => {
    query.mockResolvedValue({ rows: [] });

    await reportsRepository.listReportGroups({ page: 1, limit: 20 });

    expect(query).toHaveBeenCalledWith(expect.any(String), [20, 0]);
  });

  it('calcula el OFFSET correctamente para page=3, limit=10', async () => {
    query.mockResolvedValue({ rows: [] });

    await reportsRepository.listReportGroups({ page: 3, limit: 10 });

    // offset = (3-1) * 10 = 20
    expect(query).toHaveBeenCalledWith(expect.any(String), [10, 20]);
  });

  it("filtra solo los reportes con status = 'pending'", async () => {
    query.mockResolvedValue({ rows: [] });

    await reportsRepository.listReportGroups({ page: 1, limit: 20 });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'pending'"),
      expect.any(Array)
    );
  });

  it('agrupa por reported_id y reported_username', async () => {
    query.mockResolvedValue({ rows: [] });

    await reportsRepository.listReportGroups({ page: 1, limit: 20 });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('GROUP BY reported_id, reported_username'),
      expect.any(Array)
    );
  });

  it('ordena por total_reports DESC', async () => {
    query.mockResolvedValue({ rows: [] });

    await reportsRepository.listReportGroups({ page: 1, limit: 20 });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('total_reports DESC'),
      expect.any(Array)
    );
  });

  it('devuelve las filas que retorna la base de datos', async () => {
    const SAMPLE_ROWS = [
      {
        reported_id: REPORTED_ID,
        reported_username: 'usuario_denunciado',
        total_reports: '3',
        distinct_reporters: '2',
        last_reported_at: '2026-06-25T10:00:00.000Z',
        reports: [],
      },
    ];
    query.mockResolvedValue({ rows: SAMPLE_ROWS });

    const result = await reportsRepository.listReportGroups({ page: 1, limit: 20 });

    expect(result).toEqual(SAMPLE_ROWS);
  });
});

// ─── countReportGroups ────────────────────────────────────────────────────────

describe('reportsRepository.countReportGroups', () => {
  it("hace COUNT(DISTINCT reported_id) con filtro status = 'pending'", async () => {
    query.mockResolvedValue({ rows: [{ total: '5' }] });

    await reportsRepository.countReportGroups();

    const [sql] = query.mock.calls[0];
    expect(sql).toContain('COUNT(DISTINCT reported_id)');
    expect(sql).toContain("status = 'pending'");
  });

  it('devuelve el total como número entero', async () => {
    query.mockResolvedValue({ rows: [{ total: '7' }] });

    const result = await reportsRepository.countReportGroups();

    expect(result).toBe(7);
  });

  it('devuelve 0 si no hay grupos pendientes', async () => {
    query.mockResolvedValue({ rows: [{ total: '0' }] });

    const result = await reportsRepository.countReportGroups();

    expect(result).toBe(0);
  });
});

// ─── markReportsStatus ────────────────────────────────────────────────────────

describe('reportsRepository.markReportsStatus', () => {
  beforeEach(() => {
    query.mockResolvedValue({ rowCount: 1 });
  });

  it('ejecuta UPDATE con el status y reported_id correctos para "discarded"', async () => {
    await reportsRepository.markReportsStatus(REPORTED_ID, 'discarded');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE reports'),
      ['discarded', REPORTED_ID]
    );
  });

  it('ejecuta UPDATE con el status y reported_id correctos para "resolved"', async () => {
    await reportsRepository.markReportsStatus(REPORTED_ID, 'resolved');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE reports'),
      ['resolved', REPORTED_ID]
    );
  });

  it("solo actualiza filas con status = 'pending'", async () => {
    await reportsRepository.markReportsStatus(REPORTED_ID, 'discarded');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'pending'"),
      expect.any(Array)
    );
  });
});
