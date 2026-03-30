const { friendsService } = require('../friends.service');
const { friendsRepository } = require('../friends.repository');

jest.mock('../friends.repository', () => ({
  friendsRepository: {
    // métodos de solicitudes (necesarios para que el módulo no explote)
    countRequestsInLastHour: jest.fn(),
    isBlockedBy: jest.fn(),
    findByPair: jest.fn(),
    create: jest.fn(),
    acceptById: jest.fn(),
    // métodos de privacidad H5
    getPrivacy: jest.fn(),
    setPrivacy: jest.fn(),
    areFriends: jest.fn(),
  },
}));

const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

beforeEach(() => {
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────
// setPrivacy — H5 CA.2 + CA.3
// ─────────────────────────────────────────────
describe('friendsService.setPrivacy', () => {
  it('activa el modo privado y devuelve isPrivate: true con mensaje', async () => {
    friendsRepository.setPrivacy.mockResolvedValue({ user_id: USER_A, is_private: true });

    const result = await friendsService.setPrivacy(USER_A, true);

    expect(result).toEqual({ isPrivate: true, message: 'Modo privado activado' });
  });

  it('desactiva el modo privado y devuelve isPrivate: false con mensaje (CA.2)', async () => {
    friendsRepository.setPrivacy.mockResolvedValue({ user_id: USER_A, is_private: false });

    const result = await friendsService.setPrivacy(USER_A, false);

    expect(result).toEqual({ isPrivate: false, message: 'Modo privado desactivado' });
  });

  it('llama al repository con el userId y el valor correcto (CA.3: efecto inmediato)', async () => {
    friendsRepository.setPrivacy.mockResolvedValue({});

    await friendsService.setPrivacy(USER_A, true);

    expect(friendsRepository.setPrivacy).toHaveBeenCalledWith(USER_A, true);
  });

  it('persiste la desactivación llamando al repository inmediatamente (CA.3)', async () => {
    friendsRepository.setPrivacy.mockResolvedValue({});

    await friendsService.setPrivacy(USER_A, false);

    expect(friendsRepository.setPrivacy).toHaveBeenCalledWith(USER_A, false);
  });
});

// ─────────────────────────────────────────────
// getMyPrivacy
// ─────────────────────────────────────────────
describe('friendsService.getMyPrivacy', () => {
  it('devuelve isPrivate: true si el usuario tiene modo privado activo', async () => {
    friendsRepository.getPrivacy.mockResolvedValue({ is_private: true });

    const result = await friendsService.getMyPrivacy(USER_A);

    expect(result).toEqual({ isPrivate: true });
  });

  it('devuelve isPrivate: false si el usuario tiene modo privado inactivo', async () => {
    friendsRepository.getPrivacy.mockResolvedValue({ is_private: false });

    const result = await friendsService.getMyPrivacy(USER_A);

    expect(result).toEqual({ isPrivate: false });
  });

  it('consulta la privacidad del userId correcto', async () => {
    friendsRepository.getPrivacy.mockResolvedValue({ is_private: false });

    await friendsService.getMyPrivacy(USER_A);

    expect(friendsRepository.getPrivacy).toHaveBeenCalledWith(USER_A);
  });
});

// ─────────────────────────────────────────────
// canSeeLocation — H5 CA.1
// ─────────────────────────────────────────────
describe('friendsService.canSeeLocation', () => {
  // Perfil público
  it('permite ver la ubicación de un usuario público a cualquier persona (CA.1)', async () => {
    friendsRepository.getPrivacy.mockResolvedValue({ is_private: false });

    const result = await friendsService.canSeeLocation(USER_A, USER_B);

    expect(result).toEqual({ canSeeLocation: true });
  });

  it('no consulta amistad si el target es público', async () => {
    friendsRepository.getPrivacy.mockResolvedValue({ is_private: false });

    await friendsService.canSeeLocation(USER_A, USER_B);

    expect(friendsRepository.areFriends).not.toHaveBeenCalled();
  });

  // Perfil privado — no amigo
  it('bloquea la ubicación de un usuario privado si el requester no es su amigo (CA.1)', async () => {
    friendsRepository.getPrivacy.mockResolvedValue({ is_private: true });
    friendsRepository.areFriends.mockResolvedValue(false);

    const result = await friendsService.canSeeLocation(USER_A, USER_B);

    expect(result).toEqual({ canSeeLocation: false });
  });

  // Perfil privado — sí amigo
  it('permite ver la ubicación de un usuario privado si el requester es su amigo (CA.1)', async () => {
    friendsRepository.getPrivacy.mockResolvedValue({ is_private: true });
    friendsRepository.areFriends.mockResolvedValue(true);

    const result = await friendsService.canSeeLocation(USER_A, USER_B);

    expect(result).toEqual({ canSeeLocation: true });
  });

  it('consulta amistad con los IDs correctos cuando el target es privado', async () => {
    friendsRepository.getPrivacy.mockResolvedValue({ is_private: true });
    friendsRepository.areFriends.mockResolvedValue(false);

    await friendsService.canSeeLocation(USER_A, USER_B);

    expect(friendsRepository.areFriends).toHaveBeenCalledWith(USER_A, USER_B);
  });

  // El usuario consulta su propia ubicación
  it('siempre permite que un usuario vea su propia ubicación', async () => {
    const result = await friendsService.canSeeLocation(USER_A, USER_A);

    expect(result).toEqual({ canSeeLocation: true });
    expect(friendsRepository.getPrivacy).not.toHaveBeenCalled();
    expect(friendsRepository.areFriends).not.toHaveBeenCalled();
  });

  // Transición de estado (CA.3): el cambio de privacidad impacta de inmediato
  it('refleja el estado actual en cada consulta, sin caché (CA.3)', async () => {
    // Primera consulta: target es público
    friendsRepository.getPrivacy.mockResolvedValueOnce({ is_private: false });
    const first = await friendsService.canSeeLocation(USER_A, USER_B);
    expect(first).toEqual({ canSeeLocation: true });

    // Segunda consulta: target cambió a privado y USER_A no es amigo
    friendsRepository.getPrivacy.mockResolvedValueOnce({ is_private: true });
    friendsRepository.areFriends.mockResolvedValueOnce(false);
    const second = await friendsService.canSeeLocation(USER_A, USER_B);
    expect(second).toEqual({ canSeeLocation: false });
  });
});
