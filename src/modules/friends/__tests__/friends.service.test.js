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
    removeByPair: jest.fn(),
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
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: REQUESTER_ID,
      addressee_id: ADDRESSEE_ID,
      status: 'pending',
    });
    await expect(friendsService.removeFriend(REQUESTER_ID, ADDRESSEE_ID))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  // CA.3: eliminación simétrica
  it('llama a removeByPair con los IDs correctos (CA.3)', async () => {
    await friendsService.removeFriend(REQUESTER_ID, ADDRESSEE_ID);
    expect(friendsRepository.removeByPair).toHaveBeenCalledWith(REQUESTER_ID, ADDRESSEE_ID);
  });

  it('también elimina la amistad si B inició la solicitud a A (CA.3 - dirección inversa)', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: ADDRESSEE_ID,
      addressee_id: REQUESTER_ID,
      status: 'accepted',
    });
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