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

// H8: blockedId es el UUID del usuario a bloquear; blockedUsername viene del cliente
// para denormalizarlo en la tabla blocks sin consultar el servicio de usuarios.
const blockUserSchema = z.object({
  blockedId: z
    .string({ required_error: 'El ID del usuario a bloquear es obligatorio' })
    .uuid('El ID del usuario a bloquear no es válido'),
  blockedUsername: z
    .string({ required_error: 'El username del usuario a bloquear es obligatorio' })
    .min(1, 'El username no puede estar vacío'),
});

const unblockUserSchema = z.object({
  blockedId: z
    .string({ required_error: 'El ID del usuario a desbloquear es obligatorio' })
    .uuid('El ID del usuario a desbloquear no es válido'),
});

module.exports = {
  sendRequestSchema,
  removeFriendSchema,
  acceptRequestSchema,
  declineRequestSchema,
  blockUserSchema,
  unblockUserSchema,
};
