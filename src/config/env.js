const { z } = require('zod');

const envSchema = z.object({
  PORT: z.string().default('3001'),

  DB_HOST: z.string(),
  DB_PORT: z.string().default('5432'),
  DB_NAME: z.string(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),

  JWT_SECRET: z.string(),

  // URL del servicio de usuarios (CA.4: filtrar solicitudes de usuarios eliminados/suspendidos)
  USERS_SERVICE_URL: z.string().url().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

module.exports = { env };
