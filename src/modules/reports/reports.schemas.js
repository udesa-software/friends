const { z } = require('zod');

const VALID_REASONS = [
  'comportamiento_inapropiado',
  'spam',
  'acoso',
  'contenido_ofensivo',
  'suplantacion_identidad',
  'otro',
];

const reportUserSchema = z.object({
  reportedId: z
    .string({ required_error: 'El ID del usuario a reportar es obligatorio' })
    .uuid('El ID del usuario a reportar no es válido'),
  reason: z
    .string({ required_error: 'El motivo del reporte es obligatorio' })
    .refine((v) => VALID_REASONS.includes(v), {
      message: `El motivo debe ser uno de: ${VALID_REASONS.join(', ')}`,
    }),
});

module.exports = { reportUserSchema, VALID_REASONS };
