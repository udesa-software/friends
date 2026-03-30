const { z } = require('zod');

// CA: addresseeId es el UUID del usuario al que se le envía la solicitud.
// La resolución de username -> UUID ocurre en el cliente vía el servicio de usuarios.
const sendRequestSchema = z.object({
  addresseeId: z
    .string({ required_error: 'El ID del destinatario es obligatorio' })
    .uuid('El ID del destinatario no es válido'),
});

// H7: parámetros de consulta para listar amigos confirmados.
// sort=recent   → ORDER BY updated_at DESC (backend).
// sort=alphabetical → el backend devuelve en orden recent; el cliente
//   reordena alfabéticamente tras enriquecer con nombres desde el servicio de usuarios.
//   (Los nombres no residen en este microservicio; forzar el orden aquí requeriría
//   una llamada inter-servicio o desnormalización, que se resuelve en E.1/BFF.)
// Proximidad (CA.1) depende de E.3 Ubicaciones y se implementará en esa épica.
const listFriendsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['recent', 'alphabetical']).default('recent'),
});

module.exports = { sendRequestSchema, listFriendsSchema };
