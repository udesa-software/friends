const { friendsService } = require('../friends.service');
const { friendsRepository } = require('../friends.repository');
const { AppError } = require('../../../middlewares/errorHandler');

jest.mock('../friends.repository', () => ({
  friendsRepository: {
    countRequestsInLastHour: jest.fn(),
    isBlockedBy: jest.fn(),
    findByPair: jest.fn(),
    create: jest.fn(),
    acceptById: jest.fn(),
    listAccepted: jest.fn(),
    countAccepted: jest.fn(),
  },
}));

const REQUESTER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ADDRESSEE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const friends_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

describe('friendsService.sendRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    friendsRepository.countRequestsInLastHour.mockResolvedValue(0);
    friendsRepository.isBlockedBy.mockResolvedValue(false);
    friendsRepository.findByPair.mockResolvedValue(null);
    friendsRepository.create.mockResolvedValue({
      id: friends_ID,
      requester_id: REQUESTER_ID,
      addressee_id: ADDRESSEE_ID,
      status: 'pending',
    });
  });

  // CA.1: no auto-solicitud
  it('lanza 400 si el usuario intenta enviarse una solicitud a sí mismo', async () => {
    await expect(friendsService.sendRequest(REQUESTER_ID, REQUESTER_ID))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('lanza AppError al enviarse solicitud a sí mismo', async () => {
    await expect(friendsService.sendRequest(REQUESTER_ID, REQUESTER_ID))
      .rejects.toBeInstanceOf(AppError);
  });

  // CA.5: rate limit
  it('lanza 429 si el usuario superó el límite de 20 solicitudes por hora', async () => {
    friendsRepository.countRequestsInLastHour.mockResolvedValue(20);
    await expect(friendsService.sendRequest(REQUESTER_ID, ADDRESSEE_ID))
      .rejects.toMatchObject({ statusCode: 429 });
  });

  it('no lanza si el usuario envió exactamente 19 solicitudes (dentro del límite)', async () => {
    friendsRepository.countRequestsInLastHour.mockResolvedValue(19);
    await expect(friendsService.sendRequest(REQUESTER_ID, ADDRESSEE_ID))
      .resolves.toEqual({ message: 'Solicitud enviada' });
  });

  // CA.4: bloqueado — devuelve éxito genérico sin crear registro
  it('devuelve éxito genérico si el destinatario bloqueó al emisor', async () => {
    friendsRepository.isBlockedBy.mockResolvedValue(true);
    const result = await friendsService.sendRequest(REQUESTER_ID, ADDRESSEE_ID);
    expect(result).toEqual({ message: 'Solicitud enviada' });
  });

  it('no crea registro ni consulta findByPair si el destinatario bloqueó al emisor', async () => {
    friendsRepository.isBlockedBy.mockResolvedValue(true);
    await friendsService.sendRequest(REQUESTER_ID, ADDRESSEE_ID);
    expect(friendsRepository.create).not.toHaveBeenCalled();
    expect(friendsRepository.findByPair).not.toHaveBeenCalled();
  });

  it('verifica el bloqueo en la dirección correcta (destinatario bloqueó al emisor)', async () => {
    await friendsService.sendRequest(REQUESTER_ID, ADDRESSEE_ID);
    expect(friendsRepository.isBlockedBy).toHaveBeenCalledWith(ADDRESSEE_ID, REQUESTER_ID);
  });

  // CA.1: ya existe solicitud pendiente de A a B
  it('lanza 409 si A ya envió solicitud a B y sigue pendiente', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: REQUESTER_ID,
      addressee_id: ADDRESSEE_ID,
      status: 'pending',
    });
    await expect(friendsService.sendRequest(REQUESTER_ID, ADDRESSEE_ID))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  // CA.1: ya son amigos
  it('lanza 409 si A y B ya son amigos', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: REQUESTER_ID,
      addressee_id: ADDRESSEE_ID,
      status: 'accepted',
    });
    await expect(friendsService.sendRequest(REQUESTER_ID, ADDRESSEE_ID))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  // CA.3: solicitud inversa pendiente — auto-aceptar
  it('acepta automáticamente si B ya había enviado solicitud a A', async () => {
    const reversePending = {
      id: friends_ID,
      requester_id: ADDRESSEE_ID,
      addressee_id: REQUESTER_ID,
      status: 'pending',
    };
    friendsRepository.findByPair.mockResolvedValue(reversePending);
    friendsRepository.acceptById.mockResolvedValue({ ...reversePending, status: 'accepted' });

    const result = await friendsService.sendRequest(REQUESTER_ID, ADDRESSEE_ID);
    expect(result).toEqual({ message: 'Solicitud enviada' });
    expect(friendsRepository.acceptById).toHaveBeenCalledWith(friends_ID);
  });

  it('no crea nuevo registro al auto-aceptar solicitud inversa (CA.3)', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: ADDRESSEE_ID,
      addressee_id: REQUESTER_ID,
      status: 'pending',
    });
    friendsRepository.acceptById.mockResolvedValue({});

    await friendsService.sendRequest(REQUESTER_ID, ADDRESSEE_ID);
    expect(friendsRepository.create).not.toHaveBeenCalled();
  });

  // CA.2: crea solicitud pendiente en el caso exitoso normal
  it('crea la solicitud en estado pendiente cuando todo está en orden', async () => {
    await friendsService.sendRequest(REQUESTER_ID, ADDRESSEE_ID);
    expect(friendsRepository.create).toHaveBeenCalledWith(REQUESTER_ID, ADDRESSEE_ID);
  });

  it('devuelve mensaje de éxito al crear la solicitud', async () => {
    const result = await friendsService.sendRequest(REQUESTER_ID, ADDRESSEE_ID);
    expect(result).toEqual({ message: 'Solicitud enviada' });
  });
});

// ─── H7: friendsService.listFriends ─────────────────────────────────────────

const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const FRIEND_A  = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const FRIEND_B  = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

describe('friendsService.listFriends', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // CA.3: lista vacía — isEmpty true
  it('devuelve isEmpty true cuando el usuario no tiene amigos confirmados', async () => {
    friendsRepository.listAccepted.mockResolvedValue([]);
    friendsRepository.countAccepted.mockResolvedValue(0);

    const result = await friendsService.listFriends(USER_ID);

    expect(result.isEmpty).toBe(true);
    expect(result.friends).toHaveLength(0);
  });

  // CA.3: lista vacía — paginación coherente con total 0
  it('devuelve totalPages 0 cuando no hay amigos', async () => {
    friendsRepository.listAccepted.mockResolvedValue([]);
    friendsRepository.countAccepted.mockResolvedValue(0);

    const result = await friendsService.listFriends(USER_ID);

    expect(result.pagination.total).toBe(0);
    expect(result.pagination.totalPages).toBe(0);
  });

  // CA.2: lista con amigos — isEmpty false
  it('devuelve isEmpty false cuando hay amigos confirmados', async () => {
    friendsRepository.listAccepted.mockResolvedValue([
      { friend_id: FRIEND_A, updated_at: new Date() },
    ]);
    friendsRepository.countAccepted.mockResolvedValue(1);

    const result = await friendsService.listFriends(USER_ID);

    expect(result.isEmpty).toBe(false);
  });

  // CA.2: retorna array de friend_ids
  it('mapea las filas del repositorio a un array de friend_ids', async () => {
    friendsRepository.listAccepted.mockResolvedValue([
      { friend_id: FRIEND_A, updated_at: new Date() },
      { friend_id: FRIEND_B, updated_at: new Date() },
    ]);
    friendsRepository.countAccepted.mockResolvedValue(2);

    const result = await friendsService.listFriends(USER_ID);

    expect(result.friends).toEqual([FRIEND_A, FRIEND_B]);
  });

  // CA.2: paginación — page y limit por defecto (1 y 20)
  it('llama al repositorio con offset 0 y limit 20 por defecto', async () => {
    friendsRepository.listAccepted.mockResolvedValue([]);
    friendsRepository.countAccepted.mockResolvedValue(0);

    await friendsService.listFriends(USER_ID);

    expect(friendsRepository.listAccepted).toHaveBeenCalledWith(
      USER_ID,
      { limit: 20, offset: 0, sort: 'recent' }
    );
  });

  // CA.2: paginación — segunda página calcula offset correcto
  it('calcula el offset correcto para la página 2 con limit 20', async () => {
    friendsRepository.listAccepted.mockResolvedValue([]);
    friendsRepository.countAccepted.mockResolvedValue(25);

    await friendsService.listFriends(USER_ID, { page: 2, limit: 20, sort: 'recent' });

    expect(friendsRepository.listAccepted).toHaveBeenCalledWith(
      USER_ID,
      { limit: 20, offset: 20, sort: 'recent' }
    );
  });

  // CA.2: totalPages se calcula correctamente
  it('calcula totalPages como ceil(total / limit)', async () => {
    friendsRepository.listAccepted.mockResolvedValue([]);
    friendsRepository.countAccepted.mockResolvedValue(25);

    const result = await friendsService.listFriends(USER_ID, { page: 1, limit: 20 });

    expect(result.pagination.totalPages).toBe(2);
  });

  // CA.2: la metadata de paginación refleja page y limit recibidos
  it('incluye page y limit correctos en la metadata de paginación', async () => {
    friendsRepository.listAccepted.mockResolvedValue([]);
    friendsRepository.countAccepted.mockResolvedValue(10);

    const result = await friendsService.listFriends(USER_ID, { page: 3, limit: 5, sort: 'recent' });

    expect(result.pagination.page).toBe(3);
    expect(result.pagination.limit).toBe(5);
  });

  // CA.1: sort=alphabetical se propaga al repositorio (el cliente reordena por nombre)
  it('propaga sort=alphabetical al repositorio', async () => {
    friendsRepository.listAccepted.mockResolvedValue([]);
    friendsRepository.countAccepted.mockResolvedValue(0);

    await friendsService.listFriends(USER_ID, { page: 1, limit: 20, sort: 'alphabetical' });

    expect(friendsRepository.listAccepted).toHaveBeenCalledWith(
      USER_ID,
      { limit: 20, offset: 0, sort: 'alphabetical' }
    );
  });

  // Ejecución en paralelo de las dos queries (countAccepted + listAccepted)
  it('ejecuta listAccepted y countAccepted en paralelo', async () => {
    friendsRepository.listAccepted.mockResolvedValue([]);
    friendsRepository.countAccepted.mockResolvedValue(0);

    await friendsService.listFriends(USER_ID);

    expect(friendsRepository.listAccepted).toHaveBeenCalledTimes(1);
    expect(friendsRepository.countAccepted).toHaveBeenCalledTimes(1);
  });
});