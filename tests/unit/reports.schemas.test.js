const { reportUserSchema } = require('../../src/modules/reports/reports.schemas');

const BASE = {
  reportedId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  reportedUsername: 'reported_user',
};

describe('reportUserSchema', () => {
  it('rechaza reason="other" sin reasonDetail', () => {
    const result = reportUserSchema.safeParse({ ...BASE, reason: 'other' });
    expect(result.success).toBe(false);
    expect(result.error.flatten().fieldErrors.reasonDetail).toContain('Debés describir el motivo de la denuncia');
  });

  it('rechaza reason="other" con reasonDetail de solo espacios', () => {
    const result = reportUserSchema.safeParse({ ...BASE, reason: 'other', reasonDetail: '   ' });
    expect(result.success).toBe(false);
    expect(result.error.flatten().fieldErrors.reasonDetail).toContain('Debés describir el motivo de la denuncia');
  });

  it('acepta reason="other" con reasonDetail válido', () => {
    const result = reportUserSchema.safeParse({
      ...BASE,
      reason: 'other',
      reasonDetail: 'Me mandó mensajes amenazantes fuera de la app',
    });
    expect(result.success).toBe(true);
  });

  it('acepta otros motivos sin reasonDetail', () => {
    const result = reportUserSchema.safeParse({ ...BASE, reason: 'spam' });
    expect(result.success).toBe(true);
  });

  it('acepta otros motivos aunque venga reasonDetail (no lo exige, no lo rechaza)', () => {
    const result = reportUserSchema.safeParse({ ...BASE, reason: 'spam', reasonDetail: 'info extra' });
    expect(result.success).toBe(true);
  });

  it('rechaza reasonDetail de más de 500 caracteres', () => {
    const result = reportUserSchema.safeParse({
      ...BASE,
      reason: 'other',
      reasonDetail: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
    expect(result.error.flatten().fieldErrors.reasonDetail).toContain('La descripción no puede superar los 500 caracteres');
  });

  it('acepta reasonDetail de exactamente 500 caracteres', () => {
    const result = reportUserSchema.safeParse({
      ...BASE,
      reason: 'other',
      reasonDetail: 'a'.repeat(500),
    });
    expect(result.success).toBe(true);
  });
});
