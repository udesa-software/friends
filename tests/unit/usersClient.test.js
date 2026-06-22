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
