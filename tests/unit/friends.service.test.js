const { friendsService } = require('../../src/modules/friends/friends.service');
const { friendsRepository } = require('../../src/modules/friends/friends.repository');
const { AppError } = require('../../src/middlewares/errorHandler');

jest.mock('../../src/modules/friends/friends.repository', () => ({
  friendsRepository: {
    countRequestsInLastHour: jest.fn(),
    isBlockedBy: jest.fn(),
    findByPair: jest.fn(),
    create: jest.fn(),
    acceptById: jest.fn(),
    removeByPair: jest.fn(),
    softDeleteById: jest.fn(),
    softDeleteAllByUserId: jest.fn(),
    getPendingRequesterIds: jest.fn(),
    getPendingRequests: jest.fn(),
    getConfirmedFriends: jest.fn(),
    getConfirmedFriendIds: jest.fn(),
  },
}));

const REQUESTER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ADDRESSEE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const friends_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const REQUESTER_USERNAME = 'requester_user';
const ADDRESSEE_USERNAME = 'addressee_user';

// ---------------------------------------------------------------------------
// sendRequest
// ---------------------------------------------------------------------------
describe('friendsService.sendRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    friendsRepository.countRequestsInLastHour.mockResolvedValue(0);
    friendsRepository.isBlockedBy.mockResolvedValue(false);
    friendsRepository.findByPair.mockResolvedValue(null);
    friendsRepository.create.mockResolvedValue({
      id: friends_ID,
      requester_id: REQUESTER_ID,
      requester_username: REQUESTER_USERNAME,
      addressee_id: ADDRESSEE_ID,
      status: 'pending',
    });
  });

  // CA.1: no auto-solicitud
  it('lanza 400 si el usuario intenta enviarse una solicitud a sí mismo', async () => {
    await expect(friendsService.sendRequest(REQUESTER_ID, REQUESTER_USERNAME, REQUESTER_ID))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('lanza AppError al enviarse solicitud a sí mismo', async () => {
    await expect(friendsService.sendRequest(REQUESTER_ID, REQUESTER_USERNAME, REQUESTER_ID))
      .rejects.toBeInstanceOf(AppError);
  });

  // CA.5: rate limit
  it('lanza 429 si el usuario superó el límite de 20 solicitudes por hora', async () => {
    friendsRepository.countRequestsInLastHour.mockResolvedValue(20);
    await expect(friendsService.sendRequest(REQUESTER_ID, REQUESTER_USERNAME, ADDRESSEE_ID))
      .rejects.toMatchObject({ statusCode: 429 });
  });

  it('no lanza si el usuario envió exactamente 19 solicitudes (dentro del límite)', async () => {
    friendsRepository.countRequestsInLastHour.mockResolvedValue(19);
    await expect(friendsService.sendRequest(REQUESTER_ID, REQUESTER_USERNAME, ADDRESSEE_ID))
      .resolves.toEqual({ message: 'Solicitud enviada' });
  });

  // CA.4: bloqueado — devuelve éxito genérico sin crear registro
  it('devuelve éxito genérico si el destinatario bloqueó al emisor', async () => {
    friendsRepository.isBlockedBy.mockResolvedValue(true);
    const result = await friendsService.sendRequest(REQUESTER_ID, REQUESTER_USERNAME, ADDRESSEE_ID);
    expect(result).toEqual({ message: 'Solicitud enviada' });
  });

  it('no crea registro ni consulta findByPair si el destinatario bloqueó al emisor', async () => {
    friendsRepository.isBlockedBy.mockResolvedValue(true);
    await friendsService.sendRequest(REQUESTER_ID, REQUESTER_USERNAME, ADDRESSEE_ID);
    expect(friendsRepository.create).not.toHaveBeenCalled();
    expect(friendsRepository.findByPair).not.toHaveBeenCalled();
  });

  it('verifica el bloqueo en la dirección correcta (destinatario bloqueó al emisor)', async () => {
    await friendsService.sendRequest(REQUESTER_ID, REQUESTER_USERNAME, ADDRESSEE_ID);
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
    await expect(friendsService.sendRequest(REQUESTER_ID, REQUESTER_USERNAME, ADDRESSEE_ID))
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
    await expect(friendsService.sendRequest(REQUESTER_ID, REQUESTER_USERNAME, ADDRESSEE_ID))
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

    const result = await friendsService.sendRequest(REQUESTER_ID, REQUESTER_USERNAME, ADDRESSEE_ID);
    expect(result).toEqual({ message: 'Solicitud enviada' });
    expect(friendsRepository.acceptById).toHaveBeenCalledWith(friends_ID, REQUESTER_USERNAME);
  });

  it('no crea nuevo registro al auto-aceptar solicitud inversa (CA.3)', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: ADDRESSEE_ID,
      addressee_id: REQUESTER_ID,
      status: 'pending',
    });
    friendsRepository.acceptById.mockResolvedValue({});

    await friendsService.sendRequest(REQUESTER_ID, REQUESTER_USERNAME, ADDRESSEE_ID);
    expect(friendsRepository.create).not.toHaveBeenCalled();
  });

  // CA.2: crea solicitud pendiente en el caso exitoso normal
  it('crea la solicitud en estado pendiente cuando todo está en orden', async () => {
    await friendsService.sendRequest(REQUESTER_ID, REQUESTER_USERNAME, ADDRESSEE_ID);
    expect(friendsRepository.create).toHaveBeenCalledWith(REQUESTER_ID, REQUESTER_USERNAME, ADDRESSEE_ID);
  });

  it('devuelve mensaje de éxito al crear la solicitud', async () => {
    const result = await friendsService.sendRequest(REQUESTER_ID, REQUESTER_USERNAME, ADDRESSEE_ID);
    expect(result).toEqual({ message: 'Solicitud enviada' });
  });
});

// h3 testss
describe('friendsService.removeFriend', () => {
  const ACCEPTED_FRIENDSHIP = {
    id: friends_ID,
    requester_id: REQUESTER_ID,
    addressee_id: ADDRESSEE_ID,
    status: 'accepted',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    friendsRepository.findByPair.mockResolvedValue(ACCEPTED_FRIENDSHIP);
    friendsRepository.removeByPair.mockResolvedValue(ACCEPTED_FRIENDSHIP);
  });

  // Auto-eliminación
  it('lanza 400 si el usuario intenta eliminarse a sí mismo', async () => {
    await expect(friendsService.removeFriend(REQUESTER_ID, REQUESTER_ID))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('lanza AppError al intentar eliminarse a sí mismo', async () => {
    await expect(friendsService.removeFriend(REQUESTER_ID, REQUESTER_ID))
      .rejects.toBeInstanceOf(AppError);
  });

  // No son amigos
  it('lanza 404 si no existe amistad entre los usuarios', async () => {
    friendsRepository.findByPair.mockResolvedValue(null);
    await expect(friendsService.removeFriend(REQUESTER_ID, ADDRESSEE_ID))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  // Solicitud pendiente (no aceptada)
  it('lanza 404 si la relación existe pero está pendiente (no son amigos aún)', async () => {
    friendsRepository.findByPair.mockResolvedValue({ ...ACCEPTED_FRIENDSHIP, status: 'pending' });
    await expect(friendsService.removeFriend(REQUESTER_ID, ADDRESSEE_ID))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  // CA.3: eliminación simétrica
  it('llama a removeByPair con los IDs correctos (CA.3)', async () => {
    await friendsService.removeFriend(REQUESTER_ID, ADDRESSEE_ID);
    expect(friendsRepository.removeByPair).toHaveBeenCalledWith(REQUESTER_ID, ADDRESSEE_ID);
  });

  it('también elimina la amistad si B inició la solicitud a A (CA.3 - dirección inversa)', async () => {
    await friendsService.removeFriend(REQUESTER_ID, ADDRESSEE_ID);
    expect(friendsRepository.removeByPair).toHaveBeenCalledWith(REQUESTER_ID, ADDRESSEE_ID);
  });

  // Caso exitoso
  it('devuelve mensaje de éxito al eliminar la amistad', async () => {
    const result = await friendsService.removeFriend(REQUESTER_ID, ADDRESSEE_ID);
    expect(result).toEqual({ message: 'Amistad eliminada' });
  });

  it('consulta findByPair antes de eliminar', async () => {
    await friendsService.removeFriend(REQUESTER_ID, ADDRESSEE_ID);
    expect(friendsRepository.findByPair).toHaveBeenCalledWith(REQUESTER_ID, ADDRESSEE_ID);
  });
});

// ---------------------------------------------------------------------------
// acceptRequest — H2 CA.1
// ---------------------------------------------------------------------------
describe('friendsService.acceptRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Error: auto-aceptación
  it('lanza 400 si el usuario intenta aceptar su propia solicitud', async () => {
    await expect(friendsService.acceptRequest(REQUESTER_ID, REQUESTER_USERNAME, REQUESTER_ID))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('lanza AppError si el usuario intenta aceptar su propia solicitud', async () => {
    await expect(friendsService.acceptRequest(REQUESTER_ID, REQUESTER_USERNAME, REQUESTER_ID))
      .rejects.toBeInstanceOf(AppError);
  });

  // No existe ninguna relación
  it('lanza 409 si no existe ninguna solicitud entre los dos usuarios', async () => {
    friendsRepository.findByPair.mockResolvedValue(null);
    await expect(friendsService.acceptRequest(REQUESTER_ID, REQUESTER_USERNAME, ADDRESSEE_ID))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  // La solicitud existe en la dirección correcta → éxito (CA.1: status cambia a 'accepted')
  it('acepta correctamente cuando ADDRESSEE envió solicitud a REQUESTER y está pendiente', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: ADDRESSEE_ID,
      addressee_id: REQUESTER_ID,
      status: 'pending',
    });
    friendsRepository.acceptById.mockResolvedValue({
      id: friends_ID,
      requester_id: ADDRESSEE_ID,
      addressee_id: REQUESTER_ID,
      addressee_username: REQUESTER_USERNAME,
      status: 'accepted',
    });

    const result = await friendsService.acceptRequest(REQUESTER_ID, REQUESTER_USERNAME, ADDRESSEE_ID);
    expect(result).toEqual({ message: 'Solicitud aceptada' });
    expect(friendsRepository.acceptById).toHaveBeenCalledWith(friends_ID, REQUESTER_USERNAME);
  });

  // La solicitud está en la dirección incorrecta
  it('lanza 409 si la solicitud pendiente fue enviada por el propio REQUESTER (dirección incorrecta)', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: REQUESTER_ID,
      addressee_id: ADDRESSEE_ID,
      status: 'pending',
    });

    await expect(friendsService.acceptRequest(REQUESTER_ID, REQUESTER_USERNAME, ADDRESSEE_ID))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  // Ya son amigos
  it('lanza 409 si ya son amigos', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: ADDRESSEE_ID,
      addressee_id: REQUESTER_ID,
      status: 'accepted',
    });

    await expect(friendsService.acceptRequest(REQUESTER_ID, REQUESTER_USERNAME, ADDRESSEE_ID))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  // Llama a acceptById con el id y username correctos
  it('llama a acceptById con el ID de la relación y el username del aceptante', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: ADDRESSEE_ID,
      addressee_id: REQUESTER_ID,
      status: 'pending',
    });
    friendsRepository.acceptById.mockResolvedValue({});

    await friendsService.acceptRequest(REQUESTER_ID, REQUESTER_USERNAME, ADDRESSEE_ID);
    expect(friendsRepository.acceptById).toHaveBeenCalledTimes(1);
    expect(friendsRepository.acceptById).toHaveBeenCalledWith(friends_ID, REQUESTER_USERNAME);
  });
});

// ---------------------------------------------------------------------------
// declineRequest — H2 CA.2
// ---------------------------------------------------------------------------
describe('friendsService.declineRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // No existe ninguna relación
  it('lanza 409 si no existe solicitud entre los usuarios', async () => {
    friendsRepository.findByPair.mockResolvedValue(null);
    await expect(friendsService.declineRequest(REQUESTER_ID, ADDRESSEE_ID))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('lanza AppError si no existe solicitud entre los usuarios', async () => {
    friendsRepository.findByPair.mockResolvedValue(null);
    await expect(friendsService.declineRequest(REQUESTER_ID, ADDRESSEE_ID))
      .rejects.toBeInstanceOf(AppError);
  });

  // Solicitud válida → rechazar con éxito
  it('rechaza correctamente cuando ADDRESSEE envió solicitud a REQUESTER y está pendiente', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: ADDRESSEE_ID,
      addressee_id: REQUESTER_ID,
      status: 'pending',
    });
    friendsRepository.softDeleteById.mockResolvedValue({ id: friends_ID, deleted_at: new Date() });

    const result = await friendsService.declineRequest(REQUESTER_ID, ADDRESSEE_ID);
    expect(result).toEqual({ message: 'Solicitud rechazada' });
  });

  // CA.2: usa softDeleteById (eliminación lógica), no elimina físicamente
  it('CA.2: llama a softDeleteById para eliminación lógica, no elimina físicamente', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: ADDRESSEE_ID,
      addressee_id: REQUESTER_ID,
      status: 'pending',
    });
    friendsRepository.softDeleteById.mockResolvedValue({ id: friends_ID, deleted_at: new Date() });

    await friendsService.declineRequest(REQUESTER_ID, ADDRESSEE_ID);
    expect(friendsRepository.softDeleteById).toHaveBeenCalledWith(friends_ID);
  });

  // Solicitud en dirección incorrecta
  it('lanza 409 si la solicitud fue enviada por REQUESTER (no puede rechazar su propia solicitud enviada)', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: REQUESTER_ID,
      addressee_id: ADDRESSEE_ID,
      status: 'pending',
    });

    await expect(friendsService.declineRequest(REQUESTER_ID, ADDRESSEE_ID))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  // Ya son amigos → no se puede rechazar
  it('lanza 409 si ya son amigos', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: ADDRESSEE_ID,
      addressee_id: REQUESTER_ID,
      status: 'accepted',
    });

    await expect(friendsService.declineRequest(REQUESTER_ID, ADDRESSEE_ID))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  // Llama a softDeleteById con el id correcto
  it('llama a softDeleteById con el ID de la relación al rechazar', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: ADDRESSEE_ID,
      addressee_id: REQUESTER_ID,
      status: 'pending',
    });
    friendsRepository.softDeleteById.mockResolvedValue({ id: friends_ID, deleted_at: new Date() });

    await friendsService.declineRequest(REQUESTER_ID, ADDRESSEE_ID);
    expect(friendsRepository.softDeleteById).toHaveBeenCalledTimes(1);
    expect(friendsRepository.softDeleteById).toHaveBeenCalledWith(friends_ID);
  });

  // No llama a acceptById al rechazar
  it('no llama a acceptById al rechazar una solicitud', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: ADDRESSEE_ID,
      addressee_id: REQUESTER_ID,
      status: 'pending',
    });
    friendsRepository.softDeleteById.mockResolvedValue({ id: friends_ID, deleted_at: new Date() });

    await friendsService.declineRequest(REQUESTER_ID, ADDRESSEE_ID);
    expect(friendsRepository.acceptById).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getPendingRequests — H2 CA.3, CA.5
// (CA.4 pendiente: requiere endpoint inter-servicio en users que aún no existe)
// ---------------------------------------------------------------------------
describe('friendsService.getPendingRequests', () => {
  const THIRD_USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  const makePendingRequest = (requesterId, createdAt) => ({
    id: `${requesterId.slice(0, 8)}-0000-0000-0000-000000000000`,
    requester_id: requesterId,
    addressee_id: ADDRESSEE_ID,
    status: 'pending',
    created_at: createdAt,
    deleted_at: null,
    total_count: '1',
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // CA.5: lista vacía cuando no hay solicitudes
  it('CA.5: devuelve lista vacía y paginación cero si no hay solicitudes pendientes', async () => {
    friendsRepository.getPendingRequesterIds.mockResolvedValue([]);

    const result = await friendsService.getPendingRequests(ADDRESSEE_ID, 1);

    expect(result).toEqual({
      data: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
    expect(friendsRepository.getPendingRequests).not.toHaveBeenCalled();
  });

  // CA.3: resultados ordenados cronológicamente descendente
  it('CA.3: devuelve las solicitudes en el orden DESC que provee el repository', async () => {
    friendsRepository.getPendingRequesterIds.mockResolvedValue([REQUESTER_ID, THIRD_USER_ID]);

    const newerRequest = { ...makePendingRequest(REQUESTER_ID, new Date('2024-01-02')), total_count: '2' };
    const olderRequest = { ...makePendingRequest(THIRD_USER_ID, new Date('2024-01-01')), total_count: '2' };

    friendsRepository.getPendingRequests.mockResolvedValue({
      rows: [newerRequest, olderRequest],
      total: 2,
    });

    const result = await friendsService.getPendingRequests(ADDRESSEE_ID, 1);

    expect(result.data[0].created_at.getTime())
      .toBeGreaterThan(result.data[1].created_at.getTime());
  });

  it('CA.3: llama al repository con los parámetros de paginación correctos (page 1)', async () => {
    friendsRepository.getPendingRequesterIds.mockResolvedValue([REQUESTER_ID]);
    friendsRepository.getPendingRequests.mockResolvedValue({
      rows: [makePendingRequest(REQUESTER_ID, new Date())],
      total: 1,
    });

    await friendsService.getPendingRequests(ADDRESSEE_ID, 1);

    expect(friendsRepository.getPendingRequests).toHaveBeenCalledWith(
      ADDRESSEE_ID,
      [REQUESTER_ID],
      20,  // limit = PAGE_SIZE
      0    // offset = (1 - 1) * 20
    );
  });

  // CA.5: paginación
  it('CA.5: calcula offset correctamente para páginas mayores a 1', async () => {
    friendsRepository.getPendingRequesterIds.mockResolvedValue([REQUESTER_ID]);
    friendsRepository.getPendingRequests.mockResolvedValue({ rows: [], total: 25 });

    await friendsService.getPendingRequests(ADDRESSEE_ID, 2);

    expect(friendsRepository.getPendingRequests).toHaveBeenCalledWith(
      ADDRESSEE_ID,
      [REQUESTER_ID],
      20,  // limit
      20   // offset = (2 - 1) * 20
    );
  });

  it('CA.5: devuelve totalPages correcto cuando hay más de 20 solicitudes', async () => {
    friendsRepository.getPendingRequesterIds.mockResolvedValue([REQUESTER_ID]);
    friendsRepository.getPendingRequests.mockResolvedValue({ rows: [], total: 25 });

    const result = await friendsService.getPendingRequests(ADDRESSEE_ID, 1);

    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 25,
      totalPages: 2,
    });
  });

  it('CA.5: devuelve totalPages = 1 cuando hay exactamente 20 solicitudes', async () => {
    friendsRepository.getPendingRequesterIds.mockResolvedValue([REQUESTER_ID]);
    friendsRepository.getPendingRequests.mockResolvedValue({ rows: [], total: 20 });

    const result = await friendsService.getPendingRequests(ADDRESSEE_ID, 1);

    expect(result.pagination.totalPages).toBe(1);
  });

  it('CA.5: usa page 1 por defecto si no se pasa parámetro', async () => {
    friendsRepository.getPendingRequesterIds.mockResolvedValue([REQUESTER_ID]);
    friendsRepository.getPendingRequests.mockResolvedValue({
      rows: [makePendingRequest(REQUESTER_ID, new Date())],
      total: 1,
    });

    const result = await friendsService.getPendingRequests(ADDRESSEE_ID);

    expect(result.pagination.page).toBe(1);
    expect(friendsRepository.getPendingRequests).toHaveBeenCalledWith(
      ADDRESSEE_ID,
      [REQUESTER_ID],
      20,
      0
    );
  });

  it('CA.5: incluye pageSize 20 en la respuesta de paginación', async () => {
    friendsRepository.getPendingRequesterIds.mockResolvedValue([REQUESTER_ID]);
    friendsRepository.getPendingRequests.mockResolvedValue({ rows: [], total: 5 });

    const result = await friendsService.getPendingRequests(ADDRESSEE_ID, 1);

    expect(result.pagination.pageSize).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// getFriendsList — H7 CA.1, CA.2
// ---------------------------------------------------------------------------
describe('friendsService.getFriendsList', () => {
  const THIRD_USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  const makeFriend = (friendId, friendUsername, totalCount = '1') => ({
    friend_id: friendId,
    friend_username: friendUsername,
    total_count: totalCount,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // CA.2: lista vacía
  it('CA.2: devuelve lista vacía y paginación cero si no tiene amigos', async () => {
    friendsRepository.getConfirmedFriends.mockResolvedValue({ rows: [], total: 0 });

    const result = await friendsService.getFriendsList(REQUESTER_ID, 'alphabetical', 1);

    expect(result).toEqual({
      data: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
  });

  // CA.1: orden alfabético
  it('CA.1: llama al repository con los parámetros correctos para orden alfabético (page 1)', async () => {
    friendsRepository.getConfirmedFriends.mockResolvedValue({
      rows: [makeFriend(ADDRESSEE_ID, 'alice')],
      total: 1,
    });

    await friendsService.getFriendsList(REQUESTER_ID, 'alphabetical', 1);

    expect(friendsRepository.getConfirmedFriends).toHaveBeenCalledWith(
      REQUESTER_ID,
      20,  // limit = PAGE_SIZE
      0    // offset = (1 - 1) * 20
    );
  });

  it('CA.1: usa sortBy alphabetical por defecto si no se pasa parámetro', async () => {
    friendsRepository.getConfirmedFriends.mockResolvedValue({ rows: [], total: 0 });

    await friendsService.getFriendsList(REQUESTER_ID);

    expect(friendsRepository.getConfirmedFriends).toHaveBeenCalledWith(REQUESTER_ID, 20, 0);
  });

  // CA.1: proximidad → 501
  it('CA.1: lanza 501 si sortBy es proximity (servicio de ubicaciones no disponible)', async () => {
    await expect(friendsService.getFriendsList(REQUESTER_ID, 'proximity', 1))
      .rejects.toMatchObject({ statusCode: 501 });
  });

  it('CA.1: lanza AppError al pedir sortBy proximity', async () => {
    await expect(friendsService.getFriendsList(REQUESTER_ID, 'proximity', 1))
      .rejects.toBeInstanceOf(AppError);
  });

  it('CA.1: no consulta el repository si sortBy es proximity', async () => {
    await friendsService.getFriendsList(REQUESTER_ID, 'proximity', 1).catch(() => {});
    expect(friendsRepository.getConfirmedFriends).not.toHaveBeenCalled();
  });

  // CA.2: paginación
  it('CA.2: calcula offset correctamente para páginas mayores a 1', async () => {
    friendsRepository.getConfirmedFriends.mockResolvedValue({ rows: [], total: 25 });

    await friendsService.getFriendsList(REQUESTER_ID, 'alphabetical', 2);

    expect(friendsRepository.getConfirmedFriends).toHaveBeenCalledWith(
      REQUESTER_ID,
      20,  // limit
      20   // offset = (2 - 1) * 20
    );
  });

  it('CA.2: devuelve totalPages correcto cuando hay más de 20 amigos', async () => {
    friendsRepository.getConfirmedFriends.mockResolvedValue({ rows: [], total: 25 });

    const result = await friendsService.getFriendsList(REQUESTER_ID, 'alphabetical', 1);

    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 25,
      totalPages: 2,
    });
  });

  it('CA.2: devuelve totalPages = 1 cuando hay exactamente 20 amigos', async () => {
    friendsRepository.getConfirmedFriends.mockResolvedValue({ rows: [], total: 20 });

    const result = await friendsService.getFriendsList(REQUESTER_ID, 'alphabetical', 1);

    expect(result.pagination.totalPages).toBe(1);
  });

  it('CA.2: devuelve los datos del amigo tal como los provee el repository', async () => {
    const friend = makeFriend(ADDRESSEE_ID, 'alice');
    friendsRepository.getConfirmedFriends.mockResolvedValue({ rows: [friend], total: 1 });

    const result = await friendsService.getFriendsList(REQUESTER_ID, 'alphabetical', 1);

    expect(result.data).toEqual([friend]);
  });

  it('CA.2: usa page 1 por defecto si no se pasa parámetro', async () => {
    friendsRepository.getConfirmedFriends.mockResolvedValue({ rows: [], total: 0 });

    const result = await friendsService.getFriendsList(REQUESTER_ID);

    expect(result.pagination.page).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// deleteUserRelationships — H4 CA.2/CA.4
// ---------------------------------------------------------------------------
describe('friendsService.deleteUserRelationships', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Caso principal: el usuario tiene relaciones activas
  it('H4 CA.2/CA.4: llama a softDeleteAllByUserId con el userId correcto', async () => {
    friendsRepository.softDeleteAllByUserId.mockResolvedValue(3);

    await friendsService.deleteUserRelationships(REQUESTER_ID);

    expect(friendsRepository.softDeleteAllByUserId).toHaveBeenCalledWith(REQUESTER_ID);
  });

  it('H4 CA.2/CA.4: devuelve el conteo de relaciones eliminadas', async () => {
    friendsRepository.softDeleteAllByUserId.mockResolvedValue(3);

    const result = await friendsService.deleteUserRelationships(REQUESTER_ID);

    expect(result).toEqual({ deleted: 3 });
  });

  // Caso sin relaciones previas
  it('H4: devuelve { deleted: 0 } si el usuario no tenía relaciones activas', async () => {
    friendsRepository.softDeleteAllByUserId.mockResolvedValue(0);

    const result = await friendsService.deleteUserRelationships(REQUESTER_ID);

    expect(result).toEqual({ deleted: 0 });
  });

  // No debe llamar a ningún otro método del repositorio
  it('H4: no consulta ni modifica otras entidades del repositorio', async () => {
    friendsRepository.softDeleteAllByUserId.mockResolvedValue(0);

    await friendsService.deleteUserRelationships(REQUESTER_ID);

    expect(friendsRepository.findByPair).not.toHaveBeenCalled();
    expect(friendsRepository.softDeleteById).not.toHaveBeenCalled();
    expect(friendsRepository.removeByPair).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// H5-friends: getFriendIds — endpoint interno para location service (H2 + H6)
// ---------------------------------------------------------------------------
describe('friendsService.getFriendIds', () => {
  const FRIEND_ID_A = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  const FRIEND_ID_B = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('llama a getConfirmedFriendIds con el userId correcto', async () => {
    friendsRepository.getConfirmedFriendIds.mockResolvedValue([]);

    await friendsService.getFriendIds(REQUESTER_ID);

    expect(friendsRepository.getConfirmedFriendIds).toHaveBeenCalledWith(REQUESTER_ID);
  });

  it('devuelve { friendIds: [...] } con el array de IDs de amigos confirmados', async () => {
    friendsRepository.getConfirmedFriendIds.mockResolvedValue([FRIEND_ID_A, FRIEND_ID_B]);

    const result = await friendsService.getFriendIds(REQUESTER_ID);

    expect(result).toEqual({ friendIds: [FRIEND_ID_A, FRIEND_ID_B] });
  });

  it('devuelve { friendIds: [] } si el usuario no tiene amigos confirmados', async () => {
    friendsRepository.getConfirmedFriendIds.mockResolvedValue([]);

    const result = await friendsService.getFriendIds(REQUESTER_ID);

    expect(result).toEqual({ friendIds: [] });
  });

  it('propaga el array sin modificaciones (no filtra ni reordena)', async () => {
    const ids = [FRIEND_ID_B, FRIEND_ID_A];
    friendsRepository.getConfirmedFriendIds.mockResolvedValue(ids);

    const result = await friendsService.getFriendIds(REQUESTER_ID);

    expect(result.friendIds).toEqual(ids);
  });
});
