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
    deleteById: jest.fn(),
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
// H2 TESTS
describe('friendsService.acceptRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Error: auto-aceptación
  it('lanza 400 si el usuario intenta aceptar su propia solicitud', async () => {
    await expect(friendsService.acceptRequest(REQUESTER_ID, REQUESTER_ID))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('lanza AppError si el usuario intenta aceptar su propia solicitud', async () => {
    await expect(friendsService.acceptRequest(REQUESTER_ID, REQUESTER_ID))
      .rejects.toBeInstanceOf(AppError);
  });

  // No existe ninguna relación
  it('lanza 409 si no existe ninguna solicitud entre los dos usuarios', async () => {
    friendsRepository.findByPair.mockResolvedValue(null);
    await expect(friendsService.acceptRequest(REQUESTER_ID, ADDRESSEE_ID))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  // La solicitud existe en la dirección correcta → éxito
  it('acepta correctamente cuando ADDRESSEE envió solicitud a REQUESTER y está pendiente', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: ADDRESSEE_ID,  // quien envió
      addressee_id: REQUESTER_ID,  // quien acepta
      status: 'pending',
    });
    friendsRepository.acceptById.mockResolvedValue({
      id: friends_ID,
      requester_id: ADDRESSEE_ID,
      addressee_id: REQUESTER_ID,
      status: 'accepted',
    });

    const result = await friendsService.acceptRequest(REQUESTER_ID, ADDRESSEE_ID);
    expect(result).toEqual({ message: 'Solicitud aceptada' });
    expect(friendsRepository.acceptById).toHaveBeenCalledWith(friends_ID);
  });

  // La solicitud está en la dirección incorrecta (REQUESTER intentó enviarla, no puede auto-aceptar)
  it('lanza 409 si la solicitud pendiente fue enviada por el propio REQUESTER (dirección incorrecta)', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: REQUESTER_ID,  // REQUESTER la envió, no puede aceptar su propia solicitud
      addressee_id: ADDRESSEE_ID,
      status: 'pending',
    });

    await expect(friendsService.acceptRequest(REQUESTER_ID, ADDRESSEE_ID))
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

    await expect(friendsService.acceptRequest(REQUESTER_ID, ADDRESSEE_ID))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  // Llama a acceptById con el id correcto
  it('llama a acceptById con el ID de la relación', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: ADDRESSEE_ID,
      addressee_id: REQUESTER_ID,
      status: 'pending',
    });
    friendsRepository.acceptById.mockResolvedValue({});

    await friendsService.acceptRequest(REQUESTER_ID, ADDRESSEE_ID);
    expect(friendsRepository.acceptById).toHaveBeenCalledTimes(1);
    expect(friendsRepository.acceptById).toHaveBeenCalledWith(friends_ID);
  });
});

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
      requester_id: ADDRESSEE_ID,  // quien envió la solicitud
      addressee_id: REQUESTER_ID,  // quien la rechaza
      status: 'pending',
    });
    friendsRepository.deleteById.mockResolvedValue({ id: friends_ID });

    const result = await friendsService.declineRequest(REQUESTER_ID, ADDRESSEE_ID);
    expect(result).toEqual({ message: 'Solicitud rechazada' });
    expect(friendsRepository.deleteById).toHaveBeenCalledWith(friends_ID);
  });

  // Solicitud en dirección incorrecta (REQUESTER la mandó, no puede declinarse a sí mismo)
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

  // Llama a deleteById con el id correcto
  it('llama a deleteById con el ID de la relación al rechazar', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: ADDRESSEE_ID,
      addressee_id: REQUESTER_ID,
      status: 'pending',
    });
    friendsRepository.deleteById.mockResolvedValue({ id: friends_ID });

    await friendsService.declineRequest(REQUESTER_ID, ADDRESSEE_ID);
    expect(friendsRepository.deleteById).toHaveBeenCalledTimes(1);
    expect(friendsRepository.deleteById).toHaveBeenCalledWith(friends_ID);
  });

  // No llama a acceptById al rechazar
  it('no llama a acceptById al rechazar una solicitud', async () => {
    friendsRepository.findByPair.mockResolvedValue({
      id: friends_ID,
      requester_id: ADDRESSEE_ID,
      addressee_id: REQUESTER_ID,
      status: 'pending',
    });
    friendsRepository.deleteById.mockResolvedValue({ id: friends_ID });

    await friendsService.declineRequest(REQUESTER_ID, ADDRESSEE_ID);
    expect(friendsRepository.acceptById).not.toHaveBeenCalled();
  });
});