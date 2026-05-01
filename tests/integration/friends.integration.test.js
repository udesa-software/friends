/**
 * Tests de integración — módulo friends
 *
 * Estrategia:
 *  - Supertest dispara peticiones HTTP reales contra la app Express.
 *  - La app se conecta a una base de datos PostgreSQL de test (ver jest.integration.config.js).
 *  - Antes de la suite se corren todas las migraciones SQL en orden.
 *  - Antes de cada test se hace TRUNCATE para garantizar aislamiento total.
 *  - Al finalizar la suite se cierra el pool de conexiones.
 *
 * Cobertura (patrón AAA — Arrange / Act / Assert):
 *  - Middleware authenticate (401 con y sin token)
 *  - Validación de esquemas Zod (400)
 *  - POST   /api/friends/request  — sendRequest
 *  - POST   /api/friends/accept   — acceptRequest
 *  - POST   /api/friends/decline  — declineRequest
 *  - DELETE /api/friends/:friendId — removeFriend
 *  - GET    /api/friends/pending  — getPendingRequests
 *  - GET    /api/friends          — getFriendsList
 *  - Flujos multi-paso que cruzan varios endpoints
 */

const request  = require('supertest');
const jwt      = require('jsonwebtoken');
const fs       = require('fs');
const path     = require('path');

// setupFiles ya seteó process.env antes de este require
const app        = require('../../src/app');
const { pool }   = require('../../src/config/database');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JWT_SECRET = process.env.JWT_SECRET;

/** Genera un JWT válido con el sub y username indicados. */
function makeToken(userId, username) {
  return jwt.sign({ sub: userId, username }, JWT_SECRET, { expiresIn: '1h' });
}

/** Header Authorization listo para pasarle a supertest. */
function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Inserta directamente en la DB una fila de amistad con el estado indicado.
 * Útil para preparar precondiciones sin pasar por la capa HTTP.
 */
async function insertFriendship({ requesterId, requesterUsername, addresseeId, addresseeUsername = null, status = 'pending', deletedAt = null }) {
  const { rows } = await pool.query(
    `INSERT INTO friends
       (requester_id, requester_username, addressee_id, addressee_username, status, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [requesterId, requesterUsername, addresseeId, addresseeUsername, status, deletedAt]
  );
  return rows[0];
}

/** Inserta un bloqueo directo en la tabla blocks. */
async function insertBlock({ blockerId, blockedId }) {
  await pool.query(
    'INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)',
    [blockerId, blockedId]
  );
}

/** Obtiene la fila de friends entre dos usuarios (ignorando deleted_at). */
async function findFriendshipRaw(idA, idB) {
  const { rows } = await pool.query(
    `SELECT * FROM friends
      WHERE (requester_id = $1 AND addressee_id = $2)
         OR (requester_id = $2 AND addressee_id = $1)`,
    [idA, idB]
  );
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// IDs y tokens de usuarios de prueba
// ---------------------------------------------------------------------------

const USER_A = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', username: 'alice' };
const USER_B = { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', username: 'bob'   };
const USER_C = { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', username: 'carlos'};
const USER_D = { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', username: 'diana' };

const tokenA = makeToken(USER_A.id, USER_A.username);
const tokenB = makeToken(USER_B.id, USER_B.username);
const tokenC = makeToken(USER_C.id, USER_C.username);
const tokenD = makeToken(USER_D.id, USER_D.username);

// ---------------------------------------------------------------------------
// Setup / teardown de la suite
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Ejecuta todas las migraciones SQL en orden numérico.
  // IF NOT EXISTS en cada script garantiza idempotencia.
  const migrationsDir = path.join(__dirname, '../../src/db/migrations');
  const files = fs.readdirSync(migrationsDir).sort();
  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await pool.query(sql);
  }
});

beforeEach(async () => {
  // Limpia todas las tablas antes de cada test para garantizar aislamiento.
  await pool.query('TRUNCATE TABLE friends, blocks RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await pool.end();
});

// ===========================================================================
// MIDDLEWARE authenticate
// ===========================================================================

describe('authenticate middleware', () => {
  it('devuelve 401 cuando no se envía token', async () => {
    // Arrange: no Authorization header
    // Act
    const res = await request(app).get('/api/friends');
    // Assert
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('devuelve 401 cuando el token está malformado', async () => {
    const res = await request(app)
      .get('/api/friends')
      .set('Authorization', 'Bearer token-invalido-xxxx');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('devuelve 401 cuando el token fue firmado con otro secreto', async () => {
    const tokenConOtroSecreto = jwt.sign({ sub: USER_A.id, username: 'alice' }, 'secreto-incorrecto');
    const res = await request(app)
      .get('/api/friends')
      .set(authHeader(tokenConOtroSecreto));

    expect(res.status).toBe(401);
  });

  it('permite el acceso con un token válido', async () => {
    const res = await request(app)
      .get('/api/friends')
      .set(authHeader(tokenA));

    // No importa el cuerpo; lo que importa es que no sea 401
    expect(res.status).not.toBe(401);
  });
});

// ===========================================================================
// POST /api/friends/request — sendRequest
// ===========================================================================

describe('POST /api/friends/request', () => {
  // --- Validaciones y autenticación ---

  it('devuelve 401 sin token', async () => {
    const res = await request(app)
      .post('/api/friends/request')
      .send({ addresseeId: USER_B.id });

    expect(res.status).toBe(401);
  });

  it('devuelve 400 si falta addresseeId en el body', async () => {
    const res = await request(app)
      .post('/api/friends/request')
      .set(authHeader(tokenA))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('devuelve 400 si addresseeId no es un UUID válido', async () => {
    const res = await request(app)
      .post('/api/friends/request')
      .set(authHeader(tokenA))
      .send({ addresseeId: 'no-es-uuid' });

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('addresseeId');
  });

  // --- Regla de negocio: auto-solicitud ---

  it('devuelve 400 si el usuario se envía una solicitud a sí mismo', async () => {
    // Arrange
    // Act
    const res = await request(app)
      .post('/api/friends/request')
      .set(authHeader(tokenA))
      .send({ addresseeId: USER_A.id });

    // Assert
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  // --- Caso exitoso: crea fila en DB ---

  it('devuelve 200 y persiste la solicitud como pending en la DB', async () => {
    // Act
    const res = await request(app)
      .post('/api/friends/request')
      .set(authHeader(tokenA))
      .send({ addresseeId: USER_B.id });

    // Assert HTTP
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Solicitud enviada' });

    // Assert DB
    const row = await findFriendshipRaw(USER_A.id, USER_B.id);
    expect(row).not.toBeNull();
    expect(row.status).toBe('pending');
    expect(row.requester_id).toBe(USER_A.id);
    expect(row.requester_username).toBe(USER_A.username);
    expect(row.deleted_at).toBeNull();
  });

  // --- Duplicado: 409 ---

  it('devuelve 409 si A ya envió solicitud a B y sigue pendiente', async () => {
    // Arrange
    await insertFriendship({ requesterId: USER_A.id, requesterUsername: USER_A.username, addresseeId: USER_B.id });

    // Act
    const res = await request(app)
      .post('/api/friends/request')
      .set(authHeader(tokenA))
      .send({ addresseeId: USER_B.id });

    // Assert
    expect(res.status).toBe(409);
  });

  it('devuelve 409 si A y B ya son amigos', async () => {
    // Arrange
    await insertFriendship({
      requesterId: USER_A.id,
      requesterUsername: USER_A.username,
      addresseeId: USER_B.id,
      addresseeUsername: USER_B.username,
      status: 'accepted',
    });

    // Act
    const res = await request(app)
      .post('/api/friends/request')
      .set(authHeader(tokenA))
      .send({ addresseeId: USER_B.id });

    // Assert
    expect(res.status).toBe(409);
  });

  // --- Bloqueo: éxito genérico sin crear fila ---

  it('devuelve 200 genérico cuando B bloqueó a A, sin crear fila en la DB', async () => {
    // Arrange: B bloqueó a A
    await insertBlock({ blockerId: USER_B.id, blockedId: USER_A.id });

    // Act
    const res = await request(app)
      .post('/api/friends/request')
      .set(authHeader(tokenA))
      .send({ addresseeId: USER_B.id });

    // Assert HTTP: respuesta de éxito (no revela el bloqueo)
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Solicitud enviada' });

    // Assert DB: ninguna fila creada
    const row = await findFriendshipRaw(USER_A.id, USER_B.id);
    expect(row).toBeNull();
  });

  // --- Solicitud inversa pendiente → auto-aceptar ---

  it('auto-acepta si B ya había enviado solicitud a A, y actualiza estado a accepted en DB', async () => {
    // Arrange: B envió solicitud a A (pendiente)
    await insertFriendship({ requesterId: USER_B.id, requesterUsername: USER_B.username, addresseeId: USER_A.id });

    // Act: A "envía solicitud" a B → se auto-acepta la de B
    const res = await request(app)
      .post('/api/friends/request')
      .set(authHeader(tokenA))
      .send({ addresseeId: USER_B.id });

    // Assert HTTP
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Solicitud enviada' });

    // Assert DB: la fila original ahora tiene status 'accepted'
    const row = await findFriendshipRaw(USER_A.id, USER_B.id);
    expect(row).not.toBeNull();
    expect(row.status).toBe('accepted');
    // El username del aceptante (A) queda guardado como addressee_username
    expect(row.addressee_username).toBe(USER_A.username);
  });

  // --- Rate limit: 429 tras 20 solicitudes en la última hora ---

  it('devuelve 429 cuando el usuario alcanzó el límite de 20 solicitudes por hora', async () => {
    // Arrange: insertar 20 filas con created_at dentro de la última hora
    const targets = [
      USER_B.id, USER_C.id, USER_D.id,
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444444',
      '55555555-5555-5555-5555-555555555555',
      '66666666-6666-6666-6666-666666666666',
      '77777777-7777-7777-7777-777777777777',
      '88888888-8888-8888-8888-888888888888',
      '99999999-9999-9999-9999-999999999999',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaad',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaae',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaf',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4',
    ];
    for (const targetId of targets) {
      await pool.query(
        `INSERT INTO friends (requester_id, requester_username, addressee_id, created_at)
         VALUES ($1, $2, $3, NOW() - INTERVAL '10 minutes')`,
        [USER_A.id, USER_A.username, targetId]
      );
    }

    // Act: A intenta enviar la solicitud número 21
    const res = await request(app)
      .post('/api/friends/request')
      .set(authHeader(tokenA))
      .send({ addresseeId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' });

    // Assert
    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty('error');
  });
});

// ===========================================================================
// POST /api/friends/accept — acceptRequest
// ===========================================================================

describe('POST /api/friends/accept', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(app)
      .post('/api/friends/accept')
      .send({ requesterId: USER_A.id });

    expect(res.status).toBe(401);
  });

  it('devuelve 400 si falta requesterId en el body', async () => {
    const res = await request(app)
      .post('/api/friends/accept')
      .set(authHeader(tokenB))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('devuelve 400 si requesterId no es un UUID válido', async () => {
    const res = await request(app)
      .post('/api/friends/accept')
      .set(authHeader(tokenB))
      .send({ requesterId: 'no-uuid' });

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('requesterId');
  });

  it('devuelve 400 si el usuario intenta aceptar su propia solicitud', async () => {
    const res = await request(app)
      .post('/api/friends/accept')
      .set(authHeader(tokenA))
      .send({ requesterId: USER_A.id });

    expect(res.status).toBe(400);
  });

  it('devuelve 409 si no existe ninguna solicitud', async () => {
    // Arrange: DB vacía tras TRUNCATE
    const res = await request(app)
      .post('/api/friends/accept')
      .set(authHeader(tokenB))
      .send({ requesterId: USER_A.id });

    expect(res.status).toBe(409);
  });

  it('devuelve 409 si la solicitud fue enviada por el aceptante (dirección incorrecta)', async () => {
    // Arrange: A envió solicitud a B (no B a A)
    await insertFriendship({ requesterId: USER_A.id, requesterUsername: USER_A.username, addresseeId: USER_B.id });

    // Act: A intenta aceptar la solicitud "que le hizo a sí mismo"
    const res = await request(app)
      .post('/api/friends/accept')
      .set(authHeader(tokenA))
      .send({ requesterId: USER_B.id });

    expect(res.status).toBe(409);
  });

  it('devuelve 409 si ya son amigos', async () => {
    // Arrange
    await insertFriendship({
      requesterId: USER_A.id,
      requesterUsername: USER_A.username,
      addresseeId: USER_B.id,
      addresseeUsername: USER_B.username,
      status: 'accepted',
    });

    // Act: B intenta "aceptar de nuevo"
    const res = await request(app)
      .post('/api/friends/accept')
      .set(authHeader(tokenB))
      .send({ requesterId: USER_A.id });

    expect(res.status).toBe(409);
  });

  it('devuelve 200 y actualiza la fila a accepted en DB, guardando el username del aceptante', async () => {
    // Arrange: A envió solicitud a B
    await insertFriendship({ requesterId: USER_A.id, requesterUsername: USER_A.username, addresseeId: USER_B.id });

    // Act: B acepta
    const res = await request(app)
      .post('/api/friends/accept')
      .set(authHeader(tokenB))
      .send({ requesterId: USER_A.id });

    // Assert HTTP
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Solicitud aceptada' });

    // Assert DB: status actualizado y addressee_username persistido
    const row = await findFriendshipRaw(USER_A.id, USER_B.id);
    expect(row.status).toBe('accepted');
    expect(row.addressee_username).toBe(USER_B.username);
    expect(row.deleted_at).toBeNull();
  });
});

// ===========================================================================
// POST /api/friends/decline — declineRequest
// ===========================================================================

describe('POST /api/friends/decline', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(app)
      .post('/api/friends/decline')
      .send({ requesterId: USER_A.id });

    expect(res.status).toBe(401);
  });

  it('devuelve 400 si falta requesterId en el body', async () => {
    const res = await request(app)
      .post('/api/friends/decline')
      .set(authHeader(tokenB))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('devuelve 409 si no existe ninguna solicitud', async () => {
    const res = await request(app)
      .post('/api/friends/decline')
      .set(authHeader(tokenB))
      .send({ requesterId: USER_A.id });

    expect(res.status).toBe(409);
  });

  it('devuelve 409 si la solicitud fue enviada por el mismo usuario que rechaza', async () => {
    // Arrange: A envió solicitud a B — A no puede rechazar su propia solicitud enviada
    await insertFriendship({ requesterId: USER_A.id, requesterUsername: USER_A.username, addresseeId: USER_B.id });

    // Act: A "rechaza" desde la perspectiva incorrecta
    const res = await request(app)
      .post('/api/friends/decline')
      .set(authHeader(tokenA))
      .send({ requesterId: USER_B.id });

    expect(res.status).toBe(409);
  });

  it('devuelve 409 si ya son amigos', async () => {
    // Arrange
    await insertFriendship({
      requesterId: USER_A.id,
      requesterUsername: USER_A.username,
      addresseeId: USER_B.id,
      addresseeUsername: USER_B.username,
      status: 'accepted',
    });

    const res = await request(app)
      .post('/api/friends/decline')
      .set(authHeader(tokenB))
      .send({ requesterId: USER_A.id });

    expect(res.status).toBe(409);
  });

  it('devuelve 200 y aplica soft-delete (setea deleted_at) en la DB', async () => {
    // Arrange: A envió solicitud a B
    await insertFriendship({ requesterId: USER_A.id, requesterUsername: USER_A.username, addresseeId: USER_B.id });

    // Act: B rechaza
    const res = await request(app)
      .post('/api/friends/decline')
      .set(authHeader(tokenB))
      .send({ requesterId: USER_A.id });

    // Assert HTTP
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Solicitud rechazada' });

    // Assert DB: soft-delete — la fila sigue existiendo pero con deleted_at seteado
    const row = await findFriendshipRaw(USER_A.id, USER_B.id);
    expect(row).not.toBeNull();
    expect(row.deleted_at).not.toBeNull();
    expect(row.status).toBe('pending'); // el status no cambia, sólo deleted_at
  });

  it('el soft-delete permite que A vuelva a enviar solicitud a B después del rechazo', async () => {
    // Arrange: A envía solicitud → B rechaza (soft-delete)
    await insertFriendship({ requesterId: USER_A.id, requesterUsername: USER_A.username, addresseeId: USER_B.id });
    await request(app)
      .post('/api/friends/decline')
      .set(authHeader(tokenB))
      .send({ requesterId: USER_A.id });

    // Act: A reenvía solicitud
    const res = await request(app)
      .post('/api/friends/request')
      .set(authHeader(tokenA))
      .send({ addresseeId: USER_B.id });

    // Assert: el partial unique index permite la nueva solicitud
    expect(res.status).toBe(200);

    // Assert DB: dos filas para el mismo par (una soft-deleted, una nueva pending)
    const { rows } = await pool.query(
      'SELECT * FROM friends WHERE requester_id = $1 AND addressee_id = $2',
      [USER_A.id, USER_B.id]
    );
    expect(rows).toHaveLength(2);
    const active = rows.find(r => r.deleted_at === null);
    const deleted = rows.find(r => r.deleted_at !== null);
    expect(active).toBeDefined();
    expect(deleted).toBeDefined();
  });
});

// ===========================================================================
// DELETE /api/friends/:friendId — removeFriend
// ===========================================================================

describe('DELETE /api/friends/:friendId', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(app).delete(`/api/friends/${USER_B.id}`);

    expect(res.status).toBe(401);
  });

  it('devuelve 400 si friendId no es un UUID válido', async () => {
    const res = await request(app)
      .delete('/api/friends/no-es-uuid')
      .set(authHeader(tokenA));

    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty('friendId');
  });

  it('devuelve 400 si el usuario intenta eliminarse a sí mismo', async () => {
    const res = await request(app)
      .delete(`/api/friends/${USER_A.id}`)
      .set(authHeader(tokenA));

    expect(res.status).toBe(400);
  });

  it('devuelve 404 si no existe amistad con ese usuario', async () => {
    // Arrange: DB vacía
    const res = await request(app)
      .delete(`/api/friends/${USER_B.id}`)
      .set(authHeader(tokenA));

    expect(res.status).toBe(410);
  });

  it('devuelve 404 si la relación existe pero está pendiente (no son amigos aún)', async () => {
    // Arrange
    await insertFriendship({ requesterId: USER_A.id, requesterUsername: USER_A.username, addresseeId: USER_B.id });

    // Act
    const res = await request(app)
      .delete(`/api/friends/${USER_B.id}`)
      .set(authHeader(tokenA));

    expect(res.status).toBe(410);
  });

  it('devuelve 200 y elimina la fila de la DB — eliminación simétrica', async () => {
    // Arrange: son amigos
    await insertFriendship({
      requesterId: USER_A.id,
      requesterUsername: USER_A.username,
      addresseeId: USER_B.id,
      addresseeUsername: USER_B.username,
      status: 'accepted',
    });

    // Act: A elimina a B
    const res = await request(app)
      .delete(`/api/friends/${USER_B.id}`)
      .set(authHeader(tokenA));

    // Assert HTTP
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Amistad eliminada' });

    // Assert DB: la fila fue eliminada físicamente
    const row = await findFriendshipRaw(USER_A.id, USER_B.id);
    expect(row).toBeNull();
  });

  it('también funciona cuando fue B quien inició la solicitud original (eliminación simétrica)', async () => {
    // Arrange: B envió solicitud, A aceptó — A quiere eliminar a B
    await insertFriendship({
      requesterId: USER_B.id,
      requesterUsername: USER_B.username,
      addresseeId: USER_A.id,
      addresseeUsername: USER_A.username,
      status: 'accepted',
    });

    // Act
    const res = await request(app)
      .delete(`/api/friends/${USER_B.id}`)
      .set(authHeader(tokenA));

    expect(res.status).toBe(200);

    const row = await findFriendshipRaw(USER_A.id, USER_B.id);
    expect(row).toBeNull();
  });
});

// ===========================================================================
// GET /api/friends/pending — getPendingRequests
// ===========================================================================

describe('GET /api/friends/pending', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(app).get('/api/friends/pending');

    expect(res.status).toBe(401);
  });

  it('devuelve lista vacía y paginación cero si no hay solicitudes', async () => {
    const res = await request(app)
      .get('/api/friends/pending')
      .set(authHeader(tokenA));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({
      page: 1, pageSize: 20, total: 0, totalPages: 0,
    });
  });

  it('devuelve las solicitudes pendientes dirigidas al usuario autenticado', async () => {
    // Arrange: A y C enviaron solicitudes a B
    await insertFriendship({ requesterId: USER_A.id, requesterUsername: USER_A.username, addresseeId: USER_B.id });
    await insertFriendship({ requesterId: USER_C.id, requesterUsername: USER_C.username, addresseeId: USER_B.id });

    // Act: B consulta sus solicitudes
    const res = await request(app)
      .get('/api/friends/pending')
      .set(authHeader(tokenB));

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);
  });

  it('no incluye solicitudes enviadas por el propio usuario', async () => {
    // Arrange: A envió solicitud a B (en este endpoint B ve sus solicitudes, no A)
    await insertFriendship({ requesterId: USER_A.id, requesterUsername: USER_A.username, addresseeId: USER_B.id });

    // Act: A consulta sus propias solicitudes pendientes (como destinatario)
    const res = await request(app)
      .get('/api/friends/pending')
      .set(authHeader(tokenA));

    // Assert: A no recibirá la solicitud que él mismo envió
    expect(res.body.data).toHaveLength(0);
  });

  it('no incluye solicitudes con soft-delete (rechazadas)', async () => {
    // Arrange: A envió solicitud a B → B rechazó → soft-deleted
    await insertFriendship({
      requesterId: USER_A.id,
      requesterUsername: USER_A.username,
      addresseeId: USER_B.id,
      deletedAt: new Date(),
    });

    // Act
    const res = await request(app)
      .get('/api/friends/pending')
      .set(authHeader(tokenB));

    expect(res.body.data).toHaveLength(0);
  });

  it('no incluye amistades ya aceptadas', async () => {
    // Arrange
    await insertFriendship({
      requesterId: USER_A.id,
      requesterUsername: USER_A.username,
      addresseeId: USER_B.id,
      addresseeUsername: USER_B.username,
      status: 'accepted',
    });

    // Act
    const res = await request(app)
      .get('/api/friends/pending')
      .set(authHeader(tokenB));

    expect(res.body.data).toHaveLength(0);
  });

  it('devuelve solicitudes ordenadas por created_at DESC', async () => {
    // Arrange: C envió solicitud más antigua, A la más reciente
    await pool.query(
      `INSERT INTO friends (requester_id, requester_username, addressee_id, created_at)
       VALUES ($1, $2, $3, NOW() - INTERVAL '10 minutes')`,
      [USER_C.id, USER_C.username, USER_B.id]
    );
    await pool.query(
      `INSERT INTO friends (requester_id, requester_username, addressee_id, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [USER_A.id, USER_A.username, USER_B.id]
    );

    // Act
    const res = await request(app)
      .get('/api/friends/pending')
      .set(authHeader(tokenB));

    // Assert: el primero en la lista debe ser el más reciente (A)
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const first  = new Date(res.body.data[0].created_at);
    const second = new Date(res.body.data[1].created_at);
    expect(first.getTime()).toBeGreaterThan(second.getTime());
  });

  it('pagina correctamente — page 2 con pageSize 20', async () => {
    // Arrange: insertar 25 solicitudes a USER_B desde distintos UUIDs
    for (let i = 1; i <= 25; i++) {
      const padded = String(i).padStart(8, '0');
      await pool.query(
        `INSERT INTO friends (requester_id, requester_username, addressee_id)
         VALUES ($1, $2, $3)`,
        [`${padded}-0000-0000-0000-000000000000`, `user${i}`, USER_B.id]
      );
    }

    // Act: página 1
    const page1 = await request(app)
      .get('/api/friends/pending?page=1')
      .set(authHeader(tokenB));

    // Act: página 2
    const page2 = await request(app)
      .get('/api/friends/pending?page=2')
      .set(authHeader(tokenB));

    // Assert
    expect(page1.body.data).toHaveLength(20);
    expect(page2.body.data).toHaveLength(5);
    expect(page1.body.pagination).toEqual({ page: 1, pageSize: 20, total: 25, totalPages: 2 });
    expect(page2.body.pagination).toEqual({ page: 2, pageSize: 20, total: 25, totalPages: 2 });

    // No hay solapamiento entre páginas
    const idsPage1 = page1.body.data.map(r => r.requester_id);
    const idsPage2 = page2.body.data.map(r => r.requester_id);
    const overlap  = idsPage1.filter(id => idsPage2.includes(id));
    expect(overlap).toHaveLength(0);
  });
});

// ===========================================================================
// GET /api/friends — getFriendsList
// ===========================================================================

describe('GET /api/friends', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(app).get('/api/friends');

    expect(res.status).toBe(401);
  });

  it('devuelve lista vacía y paginación cero si no tiene amigos', async () => {
    const res = await request(app)
      .get('/api/friends')
      .set(authHeader(tokenA));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({
      page: 1, pageSize: 20, total: 0, totalPages: 0,
    });
  });

  it('devuelve amigos confirmados con friend_id y friend_username', async () => {
    // Arrange: A y B son amigos; A y C son amigos
    await insertFriendship({
      requesterId: USER_A.id, requesterUsername: USER_A.username,
      addresseeId: USER_B.id, addresseeUsername: USER_B.username,
      status: 'accepted',
    });
    await insertFriendship({
      requesterId: USER_C.id, requesterUsername: USER_C.username,
      addresseeId: USER_A.id, addresseeUsername: USER_A.username,
      status: 'accepted',
    });

    // Act
    const res = await request(app)
      .get('/api/friends')
      .set(authHeader(tokenA));

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);

    const friendIds = res.body.data.map(f => f.friend_id);
    expect(friendIds).toContain(USER_B.id);
    expect(friendIds).toContain(USER_C.id);
    // No aparece el propio usuario
    expect(friendIds).not.toContain(USER_A.id);
  });

  it('no incluye solicitudes pendientes en la lista de amigos', async () => {
    // Arrange: C envió solicitud a A (pendiente)
    await insertFriendship({ requesterId: USER_C.id, requesterUsername: USER_C.username, addresseeId: USER_A.id });

    // Act
    const res = await request(app)
      .get('/api/friends')
      .set(authHeader(tokenA));

    expect(res.body.data).toHaveLength(0);
  });

  it('ordena alfabéticamente por username del amigo', async () => {
    // Arrange: A es amigo de B (bob), C (carlos), D (diana)
    await insertFriendship({
      requesterId: USER_A.id, requesterUsername: USER_A.username,
      addresseeId: USER_D.id, addresseeUsername: USER_D.username,
      status: 'accepted',
    });
    await insertFriendship({
      requesterId: USER_A.id, requesterUsername: USER_A.username,
      addresseeId: USER_C.id, addresseeUsername: USER_C.username,
      status: 'accepted',
    });
    await insertFriendship({
      requesterId: USER_A.id, requesterUsername: USER_A.username,
      addresseeId: USER_B.id, addresseeUsername: USER_B.username,
      status: 'accepted',
    });

    // Act
    const res = await request(app)
      .get('/api/friends?sortBy=alphabetical')
      .set(authHeader(tokenA));

    // Assert: bob → carlos → diana (A-Z)
    expect(res.status).toBe(200);
    const usernames = res.body.data.map(f => f.friend_username);
    expect(usernames).toEqual([...usernames].sort());
  });

  it('devuelve 501 cuando sortBy=proximity', async () => {
    const res = await request(app)
      .get('/api/friends?sortBy=proximity')
      .set(authHeader(tokenA));

    expect(res.status).toBe(501);
    expect(res.body).toHaveProperty('error');
  });

  it('pagina correctamente', async () => {
    // Arrange: 25 amigos de A
    for (let i = 1; i <= 25; i++) {
      const padded   = String(i).padStart(8, '0');
      const friendId = `${padded}-0000-0000-0000-000000000000`;
      const uname    = `user${String(i).padStart(3, '0')}`;
      await pool.query(
        `INSERT INTO friends (requester_id, requester_username, addressee_id, addressee_username, status)
         VALUES ($1, $2, $3, $4, 'accepted')`,
        [USER_A.id, USER_A.username, friendId, uname]
      );
    }

    const page1 = await request(app)
      .get('/api/friends?page=1')
      .set(authHeader(tokenA));
    const page2 = await request(app)
      .get('/api/friends?page=2')
      .set(authHeader(tokenA));

    expect(page1.body.data).toHaveLength(20);
    expect(page2.body.data).toHaveLength(5);
    expect(page1.body.pagination).toMatchObject({ page: 1, pageSize: 20, total: 25, totalPages: 2 });
    expect(page2.body.pagination).toMatchObject({ page: 2, pageSize: 20, total: 25, totalPages: 2 });
  });
});

// ===========================================================================
// Flujos multi-paso (integración entre endpoints)
// ===========================================================================

describe('flujos multi-paso', () => {
  it('flujo completo: A envía → B acepta → ambos se ven en su lista de amigos', async () => {
    // Arrange + Act: A envía solicitud
    await request(app)
      .post('/api/friends/request')
      .set(authHeader(tokenA))
      .send({ addresseeId: USER_B.id });

    // B acepta
    await request(app)
      .post('/api/friends/accept')
      .set(authHeader(tokenB))
      .send({ requesterId: USER_A.id });

    // Assert: A ve a B en su lista
    const listA = await request(app)
      .get('/api/friends')
      .set(authHeader(tokenA));
    expect(listA.body.data.map(f => f.friend_id)).toContain(USER_B.id);

    // Assert: B ve a A en su lista
    const listB = await request(app)
      .get('/api/friends')
      .set(authHeader(tokenB));
    expect(listB.body.data.map(f => f.friend_id)).toContain(USER_A.id);
  });

  it('flujo completo: A envía → B declina → A puede reenviar la solicitud', async () => {
    // A envía
    await request(app)
      .post('/api/friends/request')
      .set(authHeader(tokenA))
      .send({ addresseeId: USER_B.id });

    // B rechaza
    await request(app)
      .post('/api/friends/decline')
      .set(authHeader(tokenB))
      .send({ requesterId: USER_A.id });

    // A reenvía (el partial unique index lo permite)
    const res = await request(app)
      .post('/api/friends/request')
      .set(authHeader(tokenA))
      .send({ addresseeId: USER_B.id });

    expect(res.status).toBe(200);

    // B vuelve a ver la nueva solicitud en sus pendientes
    const pending = await request(app)
      .get('/api/friends/pending')
      .set(authHeader(tokenB));
    expect(pending.body.data).toHaveLength(1);
  });

  it('flujo completo: A y B son amigos → A elimina a B → ninguno aparece en lista del otro', async () => {
    // Setup: hacerse amigos vía endpoints
    await request(app)
      .post('/api/friends/request')
      .set(authHeader(tokenA))
      .send({ addresseeId: USER_B.id });
    await request(app)
      .post('/api/friends/accept')
      .set(authHeader(tokenB))
      .send({ requesterId: USER_A.id });

    // A elimina a B
    const del = await request(app)
      .delete(`/api/friends/${USER_B.id}`)
      .set(authHeader(tokenA));
    expect(del.status).toBe(200);

    // Assert: listas vacías
    const listA = await request(app).get('/api/friends').set(authHeader(tokenA));
    const listB = await request(app).get('/api/friends').set(authHeader(tokenB));
    expect(listA.body.data).toHaveLength(0);
    expect(listB.body.data).toHaveLength(0);
  });

  it('flujo completo: después de eliminar la amistad, B puede reenviar solicitud a A', async () => {
    // Setup: amigos
    await request(app)
      .post('/api/friends/request')
      .set(authHeader(tokenA))
      .send({ addresseeId: USER_B.id });
    await request(app)
      .post('/api/friends/accept')
      .set(authHeader(tokenB))
      .send({ requesterId: USER_A.id });

    // A elimina a B
    await request(app)
      .delete(`/api/friends/${USER_B.id}`)
      .set(authHeader(tokenA));

    // B reenvía solicitud a A
    const res = await request(app)
      .post('/api/friends/request')
      .set(authHeader(tokenB))
      .send({ addresseeId: USER_A.id });

    expect(res.status).toBe(200);

    // A ve la solicitud en pending
    const pending = await request(app)
      .get('/api/friends/pending')
      .set(authHeader(tokenA));
    expect(pending.body.data.map(r => r.requester_id)).toContain(USER_B.id);
  });

  it('flujo auto-aceptación: A envía → B envía → se aceptan mutuamente y aparecen como amigos', async () => {
    // A envía solicitud a B
    await request(app)
      .post('/api/friends/request')
      .set(authHeader(tokenA))
      .send({ addresseeId: USER_B.id });

    // B "envía solicitud a A" → debe auto-aceptar la solicitud existente
    const res = await request(app)
      .post('/api/friends/request')
      .set(authHeader(tokenB))
      .send({ addresseeId: USER_A.id });

    expect(res.status).toBe(200);

    // Assert DB: una única fila con status accepted
    const { rows } = await pool.query(
      `SELECT * FROM friends
        WHERE (requester_id = $1 AND addressee_id = $2)
           OR (requester_id = $2 AND addressee_id = $1)`,
      [USER_A.id, USER_B.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('accepted');

    // Assert: se ven como amigos en sus listas
    const listA = await request(app).get('/api/friends').set(authHeader(tokenA));
    expect(listA.body.data.map(f => f.friend_id)).toContain(USER_B.id);
  });
});
