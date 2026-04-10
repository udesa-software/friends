// Configura las variables de entorno para los tests de integración
// ANTES de que cualquier módulo de la app sea cargado por require().
// Este archivo se ejecuta vía setupFiles en jest.integration.config.js.

process.env.DB_HOST     = process.env.TEST_DB_HOST     || 'localhost';
process.env.DB_PORT     = process.env.TEST_DB_PORT     || '5434';
process.env.DB_NAME     = process.env.TEST_DB_NAME     || 'friends_db';
process.env.DB_USER     = process.env.TEST_DB_USER     || 'admin';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || 'secret';

process.env.JWT_SECRET = 'test-jwt-secret-integration';
