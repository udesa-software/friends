const { z } = require('zod');

// CA: addresseeId es el UUID del usuario al que se le envía la solicitud.
// La resolución de username -> UUID ocurre en el cliente vía el servicio de usuarios.
const sendRequestSchema = z.object({
  addresseeId: z
    .string({ required_error: 'El ID del destinatario es obligatorio' })
    .uuid('El ID del destinatario no es válido'),
});

const removeFriendSchema = z.object({
  friendId: z
    .string({ required_error: 'El ID del amigo es obligatorio' })
    .uuid('El ID del amigo no es válido'),
});

const acceptRequestSchema = z.object({
  requesterId: z
    .string({ required_error: 'El ID del solicitante es obligatorio' })
    .uuid('El ID del solicitante no es válido'),
});

const declineRequestSchema = z.object({
  requesterId: z
    .string({ required_error: 'El ID del solicitante es obligatorio' })
    .uuid('El ID del solicitante no es válido'),
});

const blockUserSchema = z.object({
  blockedId: z
    .string({ required_error: 'El ID del usuario a bloquear es obligatorio' })
    .uuid('El ID del usuario a bloquear no es válido'),
});

module.exports = {
  sendRequestSchema,
  removeFriendSchema,
  acceptRequestSchema,
  declineRequestSchema,
  blockUserSchema,
};
