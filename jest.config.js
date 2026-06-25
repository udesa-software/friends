module.exports = {
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  setupFiles: ['./src/tests/setupEnv.js'],
  collectCoverageFrom: [
    'src/modules/friends/friends.service.js',
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
};
