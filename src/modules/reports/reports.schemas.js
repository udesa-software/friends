const { z } = require('zod');

// H9 CA.1: motivo elegido de una lista fija. reportedUsername se denormaliza desde
// el cliente, igual que blockedUsername en blockUserSchema.
const reportUserSchema = z.object({
  reportedId: z
    .string({ required_error: 'El ID del usuario a denunciar es obligatorio' })
    .uuid('El ID del usuario a denunciar no es válido'),
  reportedUsername: z
    .string({ required_error: 'El username del usuario a denunciar es obligatorio' })
    .min(1, 'El username no puede estar vacío'),
  reason: z.enum(
    ['inappropriate_content', 'harassment', 'spam', 'fake_profile', 'other'],
    { required_error: 'Debés elegir un motivo' }
  ),
});

module.exports = { reportUserSchema };
