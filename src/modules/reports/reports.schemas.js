const { z } = require('zod');

// H9 CA.1: motivo elegido de una lista fija. reportedUsername se denormaliza desde
// el cliente, igual que blockedUsername en blockUserSchema.
// reasonDetail: texto libre, solo obligatorio cuando reason = 'other' (ver superRefine).
const reportUserSchema = z
  .object({
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
    reasonDetail: z
      .string()
      .max(500, 'La descripción no puede superar los 500 caracteres')
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.reason === 'other' && !data.reasonDetail?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Debés describir el motivo de la denuncia',
        path: ['reasonDetail'],
      });
    }
  });

module.exports = { reportUserSchema };
