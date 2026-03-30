const { z } = require('zod');

// CA: addresseeId es el UUID del usuario al que se le envía la solicitud.
// La resolución de username -> UUID ocurre en el cliente vía el servicio de usuarios.
const sendRequestSchema = z.object({
  addresseeId: z
    .string({ required_error: 'El ID del destinatario es obligatorio' })
    .uuid('El ID del destinatario no es válido'),
});

// H5: isPrivate define si el modo privado está activo o no
const setPrivacySchema = z.object({
  isPrivate: z.boolean({ required_error: 'El campo isPrivate es obligatorio' }),
});

module.exports = { sendRequestSchema, setPrivacySchema };
