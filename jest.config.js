module.exports = {
  // Excluye los tests de integración del runner por defecto (requieren DB real y setupFiles propios)
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.integration\\.test\\.js$',
  ],
  collectCoverageFrom: [
    'src/modules/friends/friends.service.js',
  ],
};
