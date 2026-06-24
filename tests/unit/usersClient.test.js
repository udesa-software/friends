const { usersClient } = require('../../src/clients/usersClient');

global.fetch = jest.fn();

describe('usersClient.flagUserForReview', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      USERS_SERVICE_URL: 'http://users:3000',
      INTERNAL_SECRET: 'test-internal-secret',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  // H9 CA.4: la ruta en users está protegida con authenticateInternal
  it('llama al endpoint flag-review con el header x-internal-secret', async () => {
    global.fetch.mockResolvedValue({ ok: true });

    await usersClient.flagUserForReview('user-1');

    expect(global.fetch).toHaveBeenCalledWith('http://users:3000/internal/users/user-1/flag-review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': 'test-internal-secret',
      },
    });
  });

  it('lanza un error si la respuesta no es ok', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(usersClient.flagUserForReview('user-1')).rejects.toThrow('Users service error: 500');
  });
});

describe('usersClient.getUserUsername', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      USERS_SERVICE_URL: 'http://users:3000',
      INTERNAL_SECRET: 'test-internal-secret',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('devuelve el username cuando la respuesta es ok', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ username: 'juan_perez' }),
    });

    const result = await usersClient.getUserUsername('user-1');

    expect(global.fetch).toHaveBeenCalledWith('http://users:3000/internal/users/user-1', {
      headers: { 'x-internal-secret': 'test-internal-secret' },
    });
    expect(result).toBe('juan_perez');
  });

  it('devuelve null sin lanzar cuando la respuesta no es ok', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404 });
    expect(await usersClient.getUserUsername('user-1')).toBeNull();
  });

  it('devuelve null sin lanzar cuando fetch rechaza (users caído)', async () => {
    global.fetch.mockRejectedValue(new Error('connect ECONNREFUSED'));
    expect(await usersClient.getUserUsername('user-1')).toBeNull();
  });
});

describe('usersClient.getUnderReviewResolvedAt', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      USERS_SERVICE_URL: 'http://users:3000',
      INTERNAL_SECRET: 'test-internal-secret',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('devuelve el timestamp cuando la respuesta es ok', async () => {
    const resolvedAt = '2026-06-22T10:00:00.000Z';
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ underReviewResolvedAt: resolvedAt }),
    });

    const result = await usersClient.getUnderReviewResolvedAt('user-1');

    expect(global.fetch).toHaveBeenCalledWith('http://users:3000/internal/users/user-1/under-review-resolved-at', {
      headers: { 'x-internal-secret': 'test-internal-secret' },
    });
    expect(result).toBe(resolvedAt);
  });

  it('devuelve null sin lanzar cuando la respuesta no es ok', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500 });

    const result = await usersClient.getUnderReviewResolvedAt('user-1');

    expect(result).toBeNull();
  });

  it('devuelve null sin lanzar cuando fetch rechaza (users caído)', async () => {
    global.fetch.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const result = await usersClient.getUnderReviewResolvedAt('user-1');

    expect(result).toBeNull();
  });
});
