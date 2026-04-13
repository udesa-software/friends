/** @type {import('jest').Config} */
module.exports = {
  // Solo corre archivos *.integration.test.js
  testMatch: ['**/__tests__/*.integration.test.js'],

  // Carga las variables de entorno ANTES de que cualquier módulo sea requerido
  setupFiles: ['./src/tests/setupEnv.js'],

  // Tiempo extendido por round-trips a la base de datos
  testTimeout: 20000,

  // Un worker para evitar condiciones de carrera entre tests que comparten la DB
  maxWorkers: 1,

  // Cobertura sobre todas las capas que ejercitan los integration tests
  collectCoverageFrom: [
    'src/modules/friends/friends.routes.js',
    'src/modules/friends/friends.controller.js',
    'src/modules/friends/friends.service.js',
    'src/modules/friends/friends.repository.js',
    'src/middlewares/authenticate.js',
  ],
};
