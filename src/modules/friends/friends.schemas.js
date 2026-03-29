const { z } = require('zod');

// CA: addresseeId es el UUID del usuario al que se le envía la solicitud.
// La resolución de username -> UUID ocurre en el cliente vía el servicio de usuarios.
const sendRequestSchema = z.object({
  addresseeId: z
    .string({ required_error: 'El ID del destinatario es obligatorio' })
    .uuid('El ID del destinatario no es válido'),
});

module.exports = { sendRequestSchema };
